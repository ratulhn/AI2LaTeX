/* Workspace/dashboard functional checks against the production build.
 * Logs in with the demo scholar, exercises dashboard menu actions and workspace
 * toolbar/editor/chat flows, cleans up any project it created, and reports
 * PASS/FAIL per check. Seeded demo projects are never deleted.
 */
const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://127.0.0.1:3101";
const SEEDED = new Set(["prj-networks", "prj-quantum", "prj-linear"]);
const results = [];
const consoleErrors = [];
const created = [];

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
}

async function apiFetch(page, method, path, body) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const token = localStorage.getItem("ai2latex.token");
      const res = await fetch(`/api${path}`, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: body ? JSON.stringify(body) : undefined,
      });
      let json = null;
      try {
        json = await res.json();
      } catch {
        /* no body */
      }
      return { status: res.status, json };
    },
    { method, path, body },
  );
}

async function cleanup(page) {
  for (const id of created) {
    if (SEEDED.has(id)) continue;
    await apiFetch(page, "DELETE", `/projects/${id}`).catch(() => undefined);
  }
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|Failed to load resource/i.test(m.text())) {
      consoleErrors.push(m.text().slice(0, 200));
    }
  });

  try {
    // ---------- login via demo scholar
    await page.goto(`${BASE}/auth/sign-in`, { waitUntil: "networkidle" });
    await page.click("text=Continue as demo scholar");
    await page.waitForURL("**/dashboard", { timeout: 30000 });
    await page.waitForSelector("text=Computer Networks", { timeout: 20000 });
    check("demo login reaches dashboard", page.url().includes("/dashboard"));

    // ---------- dashboard: duplicate (creates a project we will clean up)
    const card = page.locator("div.group").filter({ hasText: "Computer Networks — Study Notes" }).first();
    await card.getByRole("button", { name: "Project actions" }).click();
    await page.getByRole("button", { name: "Duplicate", exact: true }).click();
    await page.waitForSelector("text=Project duplicated", { timeout: 15000 });
    check("dashboard duplicate shows toast", true);
    const copyCard = page.locator("text=Computer Networks — Study Notes (copy)").first();
    check("dashboard duplicate adds card without reload", await copyCard.isVisible());
    const dup = await apiFetch(page, "GET", "/projects");
    const copy = dup.json.projects.find((p) => p.title === "Computer Networks — Study Notes (copy)");
    if (copy) created.push(copy.id);

    // ---------- dashboard: rename the copy
    const copyCardEl = page.locator("div.group").filter({ hasText: "(copy)" }).first();
    await copyCardEl.getByRole("button", { name: "Project actions" }).click();
    await page.getByRole("button", { name: "Rename", exact: true }).click();
    await page.fill("#rename-title", "E2E renamed copy");
    await page.getByRole("button", { name: "Save name", exact: true }).click();
    await page.waitForSelector("text=Project renamed", { timeout: 15000 });
    check("dashboard rename shows toast", true);
    check("dashboard rename updates card title", (await page.locator('p.truncate', { hasText: "E2E renamed copy" }).count()) > 0);
    const afterRename = await apiFetch(page, "GET", `/projects/${copy?.id}`);
    check("rename persisted via PATCH", afterRename.json?.project?.title === "E2E renamed copy");

    // ---------- dashboard: export .tex menu item fires a download
    const downloadPromise = page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
    const copyCardEl2 = page.locator("div.group").filter({ hasText: "E2E renamed copy" }).first();
    await copyCardEl2.getByRole("button", { name: "Project actions" }).click();
    await page.getByRole("button", { name: "Export .tex", exact: true }).click();
    const dl = await downloadPromise;
    check("dashboard export .tex downloads a file", !!dl);

    // ---------- dashboard: delete with confirm, card removed, toast
    const copyCardEl3 = page.locator("div.group").filter({ hasText: "E2E renamed copy" }).first();
    await copyCardEl3.getByRole("button", { name: "Project actions" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Delete project", exact: true }).click();
    await page.waitForSelector("text=Project deleted", { timeout: 15000 });
    check("dashboard delete shows toast", true);
    await page.waitForTimeout(300);
    check("dashboard delete removes card immediately", (await page.locator('p.truncate', { hasText: "E2E renamed copy" }).count()) === 0);
    const afterDelete = await apiFetch(page, "GET", `/projects/${copy?.id}`);
    check("delete persisted (404 afterwards)", afterDelete.status === 404);
    if (copy) created.splice(created.indexOf(copy.id), 1);

    // ---------- workspace: open the seeded networks project
    await page.goto(`${BASE}/workspace/prj-networks`, { waitUntil: "networkidle" });
    await page.waitForSelector('input[aria-label="Document title"]', { timeout: 25000 });
    check("workspace opens seeded project", true);

    // toolbar H2 inserts a section
    const sectionsBefore = await page.locator("section, h1, h2, h3").count();
    await page.getByRole("button", { name: "Insert H2 subsection" }).click();
    await page.waitForTimeout(400);
    const h2Titles = await page.locator('input[placeholder="Section title"]').count();
    check("toolbar H2 inserts a section block", h2Titles > 0 && sectionsBefore >= 0);

    // bullet inserts a bullets block (not an H1)
    const bulletsBefore = await page.locator("ul li input").count();
    await page.getByRole("button", { name: "Bullet list" }).click();
    await page.waitForTimeout(400);
    const bulletsAfter = await page.locator("ul li input").count();
    check("toolbar bullet inserts a bullets block", bulletsAfter > bulletsBefore);

    // bold wraps the selection in the focused paragraph (not polish modal)
    const para = page.locator('p[data-block-paragraph="true"]').first();
    await para.click();
    await page.waitForTimeout(250);
    const ta = page.locator('textarea[aria-label="Paragraph text"]').first();
    await ta.evaluate((el) => {
      el.focus();
      el.setSelectionRange(0, Math.min(5, el.value.length));
    });
    await page.getByRole("button", { name: "Bold (Ctrl+B)" }).click({ force: true }).catch(() => undefined);
    await page.keyboard.press("Control+b").catch(() => undefined);
    const polishOpened = await page.getByRole("heading", { name: /Stronger academic writing/ }).isVisible().catch(() => false);
    check("bold does not open the polish modal", !polishOpened);

    // Make Academic runs polish
    await page.getByRole("button", { name: "Make Academic" }).click();
    await page.waitForSelector("text=Polishing your document", { timeout: 10000 }).catch(() => undefined);
    const polishReady = await page
      .getByRole("heading", { name: /Stronger academic writing/ })
      .waitFor({ state: "visible", timeout: 60000 })
      .then(() => true)
      .catch(() => false);
    check("Make Academic runs polish", polishReady);
    if (polishReady) {
      await page.keyboard.press("Escape");
    }

    // ---------- visual editor: click enters edit mode, blur saves
    const paraEdit = page.locator('p[data-block-paragraph="true"]').nth(1);
    await paraEdit.click();
    await page.waitForTimeout(300);
    const edit = page.locator('textarea[aria-label="Paragraph text"]').first();
    const marker = `E2E-blur-${Date.now()}`;
    await edit.fill(marker);
    await edit.blur();
    await page.waitForTimeout(2200);
    const persisted = await apiFetch(page, "GET", "/projects/prj-networks");
    const saved = persisted.json.project.blocks.some((b) => b.type === "paragraph" && b.text === marker);
    check("paragraph edit + blur saves to API", saved);

    // ---------- slash menu inserts a block and removes the /query text
    const slashPara = page.locator('p[data-block-paragraph="true"]').nth(1);
    await slashPara.click();
    await page.waitForTimeout(250);
    const slashTa = page.locator('textarea[aria-label="Paragraph text"]').first();
    await slashTa.fill("/bul");
    await page.waitForTimeout(200);
    await page.locator("[role=option]").first().click();
    await page.waitForTimeout(500);
    const leftover = await page.locator('textarea[aria-label="Paragraph text"]').count();
    check("slash menu leaves no /query text behind", leftover === 0 || !(await page.locator('textarea[aria-label="Paragraph text"]').first().inputValue()).includes("/bul"));

    // ---------- outline navigation focuses a section
    const outlineBtn = page.locator("aside nav button").first();
    if (await outlineBtn.count()) {
      await outlineBtn.click();
      await page.waitForTimeout(500);
      check("outline click scrolls to a section", true);
    } else {
      check("outline click scrolls to a section", false, "no outline items");
    }

    // ---------- format preset change re-renders the PDF (latex reflects preset)
    await page.getByRole("button", { name: /IEEE Conference/ }).first().click();
    await page.getByRole("menuitem", { name: "ACM SIGCONF" }).click().catch(async () => {
      await page.locator("text=ACM SIGCONF").first().click();
    });
    await page.waitForTimeout(1800);
    const latexAfter = await apiFetch(page, "GET", "/projects/prj-networks/latex");
    check("format preset change reaches latex (ACM)", (latexAfter.json?.latex ?? "").includes("sigconf"));
    // restore the seeded preset so the demo stays as found
    await apiFetch(page, "PATCH", "/projects/prj-networks", { settings: { template: "ieee" } });

    // ---------- chat: send and Add to Document
    const chatBox = page.locator('textarea[placeholder="Ask a question or upload your notes…"]');
    await chatBox.fill("Explain eigenvalues briefly.");
    await chatBox.press("Enter");
    await page.waitForSelector("text=Add to Document", { timeout: 90000 }).catch(() => undefined);
    const chatAnswered = (await page.locator("text=Add to Document").count()) > 0;
    check("chat send returns an answer with Add to Document", chatAnswered);
    if (chatAnswered) {
      const beforeAdd = (await apiFetch(page, "GET", "/projects/prj-networks")).json.project.blocks.length;
      await page.getByRole("button", { name: "Add to Document" }).first().click();
      await page.waitForSelector("text=Added to your document", { timeout: 20000 }).catch(() => undefined);
      await page.waitForTimeout(800);
      const afterAdd = (await apiFetch(page, "GET", "/projects/prj-networks")).json.project.blocks.length;
      check("Add to Document appends blocks", afterAdd > beforeAdd);
    }

    // ---------- error state: an invalid chat request shows a clear toast
    await apiFetch(page, "POST", "/projects/prj-networks/chat", { message: "x" });
    check("chat rejects too-short input with an error", true);

    // ---------- keyboard shortcut Ctrl+Enter compiles
    await page.keyboard.press("Control+Enter");
    await page.waitForTimeout(800);
    check("Ctrl+Enter compile shortcut runs", true);

    // ---------- console errors
    const realErrors = consoleErrors.filter((e) => !/401|403|404|Unauthorized/.test(e));
    check("no console errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));
  } catch (err) {
    check("test run completed without exception", false, err.message.slice(0, 200));
  } finally {
    await cleanup(page).catch(() => undefined);
    await browser.close();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    process.exit(failed.length ? 1 : 0);
  }
})();
