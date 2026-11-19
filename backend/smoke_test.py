"""End-to-end API smoke test for the AI2LaTeX prototype."""
from __future__ import annotations

import io
import json
import sys
import time
import zipfile

import httpx

BASE = "http://127.0.0.1:8765"
results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> bool:
    results.append((name, ok, detail))
    print(("PASS  " if ok else "FAIL  ") + name + (f"  [{detail}]" if detail else ""))
    return ok


def main() -> int:
    c = httpx.Client(base_url=BASE, timeout=240.0)

    h = c.get("/api/health").json()
    check("health", h.get("ok") is True, f"ai={h.get('ai')} compiler={h.get('compiler')}")

    # ---- auth
    r = c.post("/api/auth/login", json={"email": "alex@mit.edu", "password": "research2026"})
    check("login demo account", r.status_code == 200)
    token = r.json()["token"]
    c.headers["Authorization"] = f"Bearer {token}"

    r = c.post("/api/auth/login", json={"email": "alex@mit.edu", "password": "wrong"})
    check("login rejects bad password", r.status_code == 401)

    r = c.post("/api/auth/signup", json={"email": "bad-email", "password": "x" * 10})
    check("signup validates email", r.status_code == 400)

    new_email = f"tester{int(time.time())}@uni.edu"
    r = c.post("/api/auth/signup", json={"email": new_email, "password": "password123", "name": "Test Scholar"})
    ok = r.status_code == 200
    check("signup creates account", ok, new_email if ok else r.text[:90])
    new_token = r.json()["token"] if ok else None

    r = c.get("/api/auth/me")
    check("me returns user", r.status_code == 200 and r.json()["user"]["email"] == "alex@mit.edu")

    # ---- projects
    projects = c.get("/api/projects").json()["projects"]
    check("project list", len(projects) >= 3, f"{len(projects)} projects")

    pid = "prj-networks"
    p = c.get(f"/api/projects/{pid}").json()["project"]
    check("project detail", len(p["blocks"]) > 8, f"{len(p['blocks'])} blocks")
    check("project has assets", len(p["assets"]) >= 4, f"{len(p['assets'])} assets")
    check("project settings", p["settings"]["accent"] == "navy", json.dumps(p["settings"])[:70])

    # ---- latex synthesis
    tex = c.get(f"/api/projects/{pid}/latex").json()["latex"]
    check("latex generated", "\\documentclass" in tex and "\\begin{equation}" in tex, f"{len(tex)} chars")
    check("latex uses accent colour", "002855" in tex)
    check("latex embeds figure", "figures/fig-tcp-handshake" in tex)

    # ---- compile
    t0 = time.time()
    comp = c.post(f"/api/projects/{pid}/compile", json={"includePreview": False}).json()
    dt = time.time() - t0
    check("compile succeeds", comp["ok"] is True, f"{comp['engine']} {comp['durationMs']}ms {dt:.1f}s wall")
    check("compile page count", comp["pages"] >= 1, f"{comp['pages']} pages")
    check("compile zero errors", len(comp["errors"]) == 0)

    # ---- heading/accent change should recompile
    p2 = c.patch(f"/api/projects/{pid}", json={"settings": {**p["settings"], "accent": "crimson"}}).json()["project"]
    tex2 = c.get(f"/api/projects/{pid}/latex").json()["latex"]
    check("accent change reaches latex", "800020" in tex2)
    comp2 = c.post(f"/api/projects/{pid}/compile", json={}).json()
    check("recompile after accent change", comp2["ok"] is True)
    c.patch(f"/api/projects/{pid}", json={"settings": p["settings"]})

    # ---- pdf endpoint
    r = c.get(f"/api/projects/{pid}/pdf")
    check("pdf endpoint", r.status_code == 200 and r.content[:4] == b"%PDF", f"{len(r.content)} bytes")

    # ---- exports
    r = c.get(f"/api/projects/{pid}/export/tex")
    ok = r.status_code == 200 and r.content[:2] == b"PK"
    detail = ""
    if ok:
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        names = zf.namelist()
        has_main = "main.tex" in names
        has_figs = any(n.startswith("figures/fig-") for n in names)
        ok = has_main and has_figs
        detail = f"{len(names)} files"
    check("tex bundle export", ok, detail)

    r = c.get(f"/api/projects/{pid}/export/docx")
    check("docx export", r.status_code == 200 and r.content[:2] == b"PK", f"{len(r.content)} bytes")

    r = c.get(f"/api/projects/{pid}/export/markdown")
    check("markdown export", r.status_code == 200 and b"#" in r.content)

    # ---- versions
    vers = c.get(f"/api/projects/{pid}/versions").json()["versions"]
    check("version history", len(vers) >= 3, f"{len(vers)} versions")
    vdetail = c.get(f"/api/projects/{pid}/versions/{vers[0]['id']}").json()["version"]
    check("version snapshot readable", isinstance(vdetail["snapshot"], dict))

    restored = c.post(f"/api/projects/{pid}/restore", json={"version_id": vers[-1]["id"]})
    check("restore version", restored.status_code == 200)
    check("restore keeps history", len(c.get(f"/api/projects/{pid}/versions").json()["versions"]) > len(vers))
    # restore original content afterwards
    c.post(f"/api/projects/{pid}/restore", json={"version_id": vers[0]["id"]})

    # ---- ai chat
    credits_before = c.get("/api/auth/me").json()["user"]["credits"]
    chat = c.post(f"/api/projects/{pid}/chat", json={"message": "Compare TCP and UDP for my notes. Include a table and throughput formula."}).json()
    check("ai chat responds", len(chat["markdown"]) > 120, f"source={chat['source']} {chat['latencyMs']}ms")
    check("ai chat returns blocks", len(chat["blocks"]) > 0, f"{len(chat['blocks'])} blocks")
    kinds = {b["type"] for b in chat["blocks"]}
    check("ai answer has table + math", "table" in kinds and "equation" in kinds, str(sorted(kinds)))
    check("credits decremented", chat["creditsRemaining"] == credits_before - 1, f"{credits_before} -> {chat['creditsRemaining']}")

    hist = c.get(f"/api/projects/{pid}/chat").json()["messages"]
    check("chat history stored", len(hist) >= 2, f"{len(hist)} messages")

    # ---- add blocks to document
    before = len(c.get(f"/api/projects/{pid}").json()["project"]["blocks"])
    added = c.post(f"/api/projects/{pid}/blocks", json={"blocks": chat["blocks"], "snapshotLabel": "AI test"}).json()
    check("add blocks to document", added["added"] == len(chat["blocks"]), f"{before} -> {len(added['project']['blocks'])}")

    # ---- polish
    pol = c.post(f"/api/projects/{pid}/polish", json={"options": ["tone", "symbols"]}).json()
    check("ai polish returns diff", isinstance(pol["changes"], list), f"{len(pol['changes'])} changes, source={pol['source']}")

    # ---- figures + vectorize
    figs = c.get("/api/figures").json()["figures"]
    check("figure library", len(figs) >= 4, f"{len(figs)} figures")
    vec = c.post(f"/api/projects/{pid}/vectorize", json={"description": "TCP handshake"}).json()
    check("vectorize returns svg", vec["svg"].lstrip().startswith("<svg"))

    # ---- assets
    r = c.get(f"/api/projects/{pid}/assets/tcp-handshake.svg")
    check("asset served", r.status_code == 200 and b"<svg" in r.content)

    # ---- ingest (OCR fallback)
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
        "1f15c4890000000a49444154789c6300010000050001026d2a0e0000000049454e44ae426082"
    )
    r = c.post(f"/api/projects/{pid}/ingest", files={"file": ("notes.png", png, "image/png")})
    ok = r.status_code == 200
    check("ocr ingest", ok and len(r.json()["blocks"]) > 0, r.json().get("engine") if ok else r.text[:80])

    # ---- billing / stats
    up = c.post("/api/billing/upgrade", json={"plan": "pro"}).json()
    check("upgrade plan", up["user"]["plan"] == "pro", f"credits={up['user']['credits']}")
    c.post("/api/billing/upgrade", json={"plan": "free"})
    stats = c.get("/api/stats").json()
    check("stats endpoint", stats["projects"] >= 3, json.dumps(stats))

    # ---- project creation limits for a fresh free user
    if new_token:
        c2 = httpx.Client(base_url=BASE, headers={"Authorization": f"Bearer {new_token}"}, timeout=60)
        created = []
        for i in range(3):
            rr = c2.post("/api/projects", json={"title": f"Doc {i}", "starter": "outline"})
            created.append(rr.status_code)
        check("free user can create 3", created == [200, 200, 200], str(created))
        rr = c2.post("/api/projects", json={"title": "Fourth"})
        check("free limit blocks 4th", rr.status_code == 402, rr.text[:70])
        rr = c2.get("/api/projects")
        check("new user isolated", len(rr.json()["projects"]) == 3, f"{len(rr.json()['projects'])} projects")
        first_id = rr.json()["projects"][0]["id"]
        rr = c2.get(f"/api/projects/{first_id}/latex")
        check("new user latex", rr.status_code == 200 and "AI2LATEX" in rr.json()["latex"])
        rr = c2.get(f"/api/projects/{pid}")
        check("cannot read other user project", rr.status_code == 404)

    # ---- restore demo project to a clean state
    c.patch(f"/api/projects/{pid}", json={"blocks": p["blocks"], "abstract": p["abstract"], "title": p["title"]})
    c.post("/api/billing/upgrade", json={"plan": "free"})
    fresh = c.get("/api/projects").json()
    check("demo project restored", fresh["projects"][0]["wordCount"] > 100, f"{fresh['projects'][0]['wordCount']} words")

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        print("FAILURES:")
        for name, _, detail in failed:
            print(f"  - {name} {detail}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
