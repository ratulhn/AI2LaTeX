const { chromium } = require("playwright");
const BASE = "http://127.0.0.1:3101";
const results = [];
const check = (n, ok, d = "") => {
  results.push([n, ok, d]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  [${d}]` : ""}`);
};

/** Read the computed cursor of the first matching element. */
async function cursorOf(page, locator, label) {
  try {
    const el = locator.first();
    await el.waitFor({ state: "attached", timeout: 8000 });
    const c = await el.evaluate((n) => getComputedStyle(n).cursor);
    check(label, c === "pointer", c);
    return c;
  } catch (e) {
    check(label, false, "not found");
    return null;
  }
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // ---------------- landing
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await cursorOf(page, page.getByRole("link", { name: /Start free/i }), "landing: Start free is pointer");
  await cursorOf(page, page.getByRole("link", { name: /^Sign in$/i }), "landing: Sign in is pointer");
  await cursorOf(page, page.locator('a[href="#how"]'), "landing: nav anchor is pointer");

  // ---------------- auth (inputs stay text, checkbox pointer)
  await page.goto(`${BASE}/auth/sign-in`, { waitUntil: "networkidle" });
  const emailCursor = await page.locator("#email").evaluate((n) => getComputedStyle(n).cursor);
  check("sign-in: email input is text cursor", emailCursor === "text", emailCursor);
  await cursorOf(page, page.locator("label").filter({ hasText: "Remember this device" }), "sign-in: checkbox label is pointer");
  await cursorOf(page, page.getByRole("button", { name: /^Sign in$/i }), "sign-in: submit button is pointer");
  await cursorOf(page, page.getByRole("button", { name: /Forgot password/i }), "sign-in: forgot-password is pointer");

  // ---------------- dashboard
  await page.click("text=Fill demo credentials");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/dashboard", { timeout: 25000 });
  await page.waitForTimeout(1800);

  await cursorOf(page, page.getByRole("button", { name: /New Document/i }), "dashboard: New Document is pointer");
  await cursorOf(page, page.getByRole("button", { name: /Turn a Photo into PDF/i }), "dashboard: import card is pointer");
  await cursorOf(page, page.locator('button[aria-label="Project actions"]'), "dashboard: project menu is pointer");
  await cursorOf(page, page.getByRole("tab", { name: "Papers" }), "dashboard: filter tab is pointer");
  await cursorOf(page, page.locator("a[href^='/workspace/']"), "dashboard: project card link is pointer");

  // ---------------- workspace
  await page.goto(`${BASE}/workspace/prj-networks`, { waitUntil: "networkidle" });
  await page.waitForSelector('input[aria-label="Document title"]', { timeout: 30000 });
  await page.waitForTimeout(2500);

  await cursorOf(page, page.getByRole("tab", { name: /Visual Editor/i }), "workspace: view-mode tab is pointer");
  await cursorOf(page, page.getByRole("button", { name: /^Download/i }), "workspace: Download is pointer");
  await cursorOf(page, page.getByRole("button", { name: /Version history/i }), "workspace: Version history is pointer");
  await cursorOf(page, page.getByRole("button", { name: /AI Polish/i }), "workspace: AI Polish is pointer");
  await cursorOf(page, page.getByRole("button", { name: /IEEE Conference|IEEE Format/i }), "workspace: format menu is pointer");
  await cursorOf(page, page.locator('button[aria-label="Insert math"]'), "workspace: math toolbar button is pointer");
  await cursorOf(page, page.locator('button[aria-label="Insert table"]'), "workspace: table toolbar button is pointer");
  await cursorOf(page, page.locator('button[aria-label="Insert image"]'), "workspace: image toolbar button is pointer");
  await cursorOf(page, page.locator("nav button").first(), "workspace: outline item is pointer");

  // textareas in the canvas stay text
  const taCursor = await page.locator('textarea[aria-label="Abstract"]').evaluate((n) => getComputedStyle(n).cursor);
  check("workspace: abstract textarea is text cursor", taCursor === "text", taCursor);
  const selCursor = await page.locator("select").first().evaluate((n) => getComputedStyle(n).cursor);
  check("workspace: heading-level select is pointer", selCursor === "pointer", selCursor);

  // ---------------- modal + disabled state
  await page.getByRole("button", { name: /Version history/i }).click();
  await page.waitForTimeout(1200);
  await cursorOf(page, page.getByRole("button", { name: /Restore Selected Version/i }), "modal: restore button is pointer");
  await cursorOf(page, page.locator('[role="dialog"] button[aria-label="Close dialog"]'), "modal: close button is pointer");
  // a disabled button must show not-allowed
  const disabledCursor = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button:disabled")];
    if (!btns.length) return "no-disabled-button";
    return getComputedStyle(btns[0]).cursor;
  });
  check("disabled button shows not-allowed", disabledCursor === "not-allowed", disabledCursor);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // ---------------- source editor + split (still clickable chrome)
  await page.getByRole("tab", { name: /Source Editor/i }).click();
  await page.waitForTimeout(1200);
  await cursorOf(page, page.getByRole("button", { name: /Compile & Save/i }), "source view: Compile & Save is pointer");
  const srcTaCursor = await page.locator("textarea.code-editor").evaluate((n) => getComputedStyle(n).cursor);
  check("source editor: code area is text cursor", srcTaCursor === "text", srcTaCursor);

  // ---------------- pricing
  await page.goto(`${BASE}/pricing`, { waitUntil: "networkidle" });
  await cursorOf(page, page.locator("button", { hasText: "Continue with Stripe" }), "pricing: upgrade button is pointer");

  await browser.close();
  const failed = results.filter((r) => !r[1]);
  console.log(`\n${results.length - failed.length}/${results.length} cursor checks passed`);
  if (failed.length) {
    console.log("FAILED:");
    failed.forEach(([n, , d]) => console.log(`  - ${n} [${d}]`));
  }
  process.exit(failed.length === 0 ? 0 : 1);
})();
