const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:3101";
const OUT = "C:/Users/User/AppData/Local/Temp/ai2latex-shots";
const errors = [];
const results = [];
const check = (n, ok, d = "") => {
  results.push([n, ok, d]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  [${d}]` : ""}`);
};

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 250)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|DevTools|websocket/i.test(m.text())) errors.push(m.text().slice(0, 200));
  });

  const stamp = Date.now().toString().slice(-7);
  const email = `e2e${stamp}@uni.edu`;

  // ---------- sign up through the UI (all three steps)
  await page.goto(`${BASE}/auth/sign-up`, { waitUntil: "networkidle" });
  await page.fill("#name", "E2E Scholar");
  await page.fill("#email", email);
  await page.fill("#password", "password123");
  await page.locator("text=I agree to the Terms of Service").click();
  await page.click("text=Continue · verify email");
  await page.waitForTimeout(700);
  check("signup step 2 (captcha) shows", await page.locator("text=Confirm you are human").isVisible());

  await page.locator("text=I'm not a robot").click();
  await page.click("text=Continue · verify email");
  await page.waitForTimeout(1800);
  check("signup step 3 (code) shows", await page.locator("text=Check your email").isVisible());
  await page.screenshot({ path: `${OUT}/30-signup-verify.png` });

  const codeInputs = page.locator('input[inputmode="numeric"]');
  const digits = "204815";
  for (let i = 0; i < 6; i += 1) await codeInputs.nth(i).fill(digits[i]);
  await page.click("text=Verify email & create account");
  await page.waitForURL("**/dashboard", { timeout: 30000 });
  check("signup completes into dashboard", page.url().includes("/dashboard"));
  await page.waitForTimeout(1500);
  check("new user has empty workspace", await page.locator("text=No projects here yet").isVisible());
  await page.screenshot({ path: `${OUT}/31-new-user-dashboard.png` });

  // ---------- create a project
  await page.click("text=New Document");
  await page.waitForTimeout(500);
  const title = `E2E Doc ${stamp}`;
  await page.fill("#new-title", title);
  await page.click("text=Create & open");
  await page.waitForURL("**/workspace/**", { timeout: 30000 });
  await page.waitForSelector('input[aria-label="Document title"]', { timeout: 25000 });
  check("created project opens in editor", (await page.inputValue('input[aria-label="Document title"]')) === title);

  // ---------- edit abstract
  const abstractBox = page.locator('textarea[aria-label="Abstract"]');
  await abstractBox.fill("This abstract was typed by the automated end-to-end test.");
  await abstractBox.blur();
  await page.waitForTimeout(2200);

  // ---------- edit a paragraph in the canvas
  const paras = page.locator("p[data-block-paragraph]");
  const paraCount = await paras.count();
  let edited = false;
  for (let i = 0; i < paraCount; i += 1) {
    const p = paras.nth(i);
    const text = (await p.innerText().catch(() => "")).trim();
    if (!text || /^abstract$/i.test(text)) continue;
    await p.click();
    await page.waitForTimeout(350);
    const ta = page.locator('textarea[aria-label="Paragraph text"]').first();
    if (await ta.count()) {
      await ta.fill("Paragraph written by the E2E test with $E = mc^2$ inline math."); await ta.blur();
      await page.waitForTimeout(300);
      edited = true;
    }
    break;
  }
  check("paragraph editable in canvas", edited);

  // ---------- insert equation + table via toolbar
  await page.locator('button[aria-label="Insert math"]').first().click();
  await page.waitForTimeout(600);
  check("equation modal opens from toolbar", await page.getByRole("heading", { name: "Insert equation" }).isVisible());
  await page.getByRole("dialog").getByRole("button", { name: "Insert equation", exact: true }).click();
  await page.waitForTimeout(1000);

  await page.locator('button[aria-label="Insert table"]').first().click();
  await page.waitForTimeout(600);
  check("table modal opens from toolbar", await page.getByRole("heading", { name: "Insert table" }).isVisible());
  await page.getByRole("dialog").getByRole("button", { name: "Insert table", exact: true }).click();
  await page.waitForTimeout(1000);

  await page.waitForTimeout(2800);
  await page.screenshot({ path: `${OUT}/32-e2e-edited.png` });

  // ---------- persistence after reload
  await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector('input[aria-label="Document title"]', { timeout: 30000 });
  await page.waitForTimeout(3200);
  check("title persisted", (await page.inputValue('input[aria-label="Document title"]')) === title);
  check("abstract persisted", (await page.locator('textarea[aria-label="Abstract"]').inputValue()).includes("automated end-to-end"));
  check("equation persisted", (await page.locator(".paper .katex-display").count()) > 0);
  check("table persisted", (await page.locator(".paper table").count()) > 0);

  // ---------- compile & verify latex/pdf agree with the canvas
  const api = await page.evaluate(async () => {
    const token = localStorage.getItem("ai2latex.token");
    const id = location.pathname.split("/").pop();
    const h = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    const tex = await (await fetch(`/api/projects/${id}/latex`, { headers: h })).json();
    const comp = await (await fetch(`/api/projects/${id}/compile`, { method: "POST", headers: h, body: "{}" })).json();
    const pdf = await (await fetch(`/api/projects/${id}/pdf`, { headers: h })).arrayBuffer();
    return {
      hasAbstract: tex.latex.includes("automated end-to-end"),
      hasPara: tex.latex.includes("E2E test"),
      hasEquationEnv: tex.latex.includes("\\begin{equation}"),
      hasTableEnv: tex.latex.includes("\\begin{tabular}"),
      ok: comp.ok, engine: comp.engine, pages: comp.pages, errors: comp.errors,
      pdfLen: pdf.byteLength,
    };
  });
  check("latex mirrors typed abstract", api.hasAbstract);
  check("latex mirrors typed paragraph", api.hasPara);
  check("latex has equation env", api.hasEquationEnv);
  check("latex has table env", api.hasTableEnv);
  check("compile of edited doc", api.ok === true, `engine=${api.engine} pages=${api.pages}`);
  check("pdf generated", api.pdfLen > 5000, `${api.pdfLen} bytes`);

  // ---------- split view shows compiled pdf
  await page.click("text=Split PDF View");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/33-e2e-split.png` });
  check("split view iframe present", (await page.locator('iframe[title="Compiled PDF preview"]').count()) === 1);

  // ---------- accent theme round trip
  await page.click("text=Visual Editor");
  await page.waitForTimeout(600);
  await page.click("text=Page style");
  await page.waitForTimeout(800);
  await page.locator("text=Oxford Crimson").first().click();
  await page.locator("text=Apply to document & PDF").click();
  await page.waitForTimeout(3200);
  const crimson = await page.evaluate(async () => {
    const token = localStorage.getItem("ai2latex.token");
    const id = location.pathname.split("/").pop();
    const tex = await (await fetch(`/api/projects/${id}/latex`, { headers: { Authorization: `Bearer ${token}` } })).json();
    return tex.latex.includes("800020");
  });
  check("accent theme reaches latex", crimson);
  await page.screenshot({ path: `${OUT}/34-e2e-crimson.png` });

  // ---------- version history has our snapshots
  await page.click("text=Version history");
  await page.waitForTimeout(1400);
  const versionCount = await page.locator("text=Created project").count();
  check("version history shows creation", versionCount > 0);
  await page.screenshot({ path: `${OUT}/35-e2e-versions.png` });
  await page.keyboard.press("Escape");

  // ---------- AI chat on this document
  await page.waitForTimeout(500);
  const chatBox = page.locator('textarea[placeholder="Ask a question or upload your notes…"]');
  await chatBox.waitFor({ state: "visible", timeout: 20000 });
  await chatBox.fill("Explain the Schrödinger equation with a table.");
  await chatBox.press("Enter");
  await page.waitForSelector("text=Academic response", { timeout: 60000 }).catch(() => {});
  await page.waitForSelector("text=Add to Document", { timeout: 15000 }).catch(() => {});
  check("ai answer on new doc", (await page.locator("text=Academic response").count()) > 0 && (await page.locator("text=Add to Document").count()) > 0);
  await page.screenshot({ path: `${OUT}/36-e2e-chat.png` });

  // ---------- export downloads
  const exportCheck = await page.evaluate(async () => {
    const token = localStorage.getItem("ai2latex.token");
    const id = location.pathname.split("/").pop();
    const h = { Authorization: `Bearer ${token}` };
    const tex = await fetch(`/api/projects/${id}/export/tex`, { headers: h });
    const docx = await fetch(`/api/projects/${id}/export/docx`, { headers: h });
    const tb = await tex.arrayBuffer();
    const db = await docx.arrayBuffer();
    return { texLen: tb.byteLength, texZip: new DataView(tb).getUint8(0) === 0x50, docxZip: new DataView(db).getUint8(0) === 0x50, docxLen: db.byteLength };
  });
  check("tex zip downloads", exportCheck.texZip && exportCheck.texLen > 1000, `${exportCheck.texLen} bytes`);
  check("docx downloads", exportCheck.docxZip && exportCheck.docxLen > 5000, `${exportCheck.docxLen} bytes`);

  // ---------- mobile
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await mob.newPage();
  await mp.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/37-mobile.png` });
  await mp.screenshot({ path: `${OUT}/37-mobile.png` });
  check("mobile landing renders", await mp.locator("text=From rough notes").isVisible());
  await mob.close();

  await browser.close();
  console.log("\nerrors:", errors.length ? errors.slice(0, 8) : "none");
  const failed = results.filter((r) => !r[1]);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed · user ${email}`);
  process.exit(failed.length === 0 && errors.length === 0 ? 0 : 1);
})();
