/**
 * AI2LaTeX — auth UI verification (Playwright)
 *
 * Covers the frontend half of docs/auth-contract.md against the REAL running
 * API at 127.0.0.1:8765 (proxied through the Next server's /api rewrite), plus
 * two clearly-marked route-stubbed UI-contract checks where the real backend
 * cannot be driven headlessly:
 *
 *   - The verification step needs a `devCode` we cannot obtain without a real
 *     CAPTCHA answer (the backend stores only a salted hash of it), so that
 *     branch is exercised with page.route stubs. UI CONTRACT, not integration.
 *   - The unverified-login 403 branch is stubbed the same way, because creating
 *     an unverified account also needs a solved CAPTCHA.
 *
 * Everything else runs unmodified against the live backend.
 */
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:3101";
const OUT = "C:/Users/User/AppData/Local/Temp/ai2latex-shots";
const results = [];
const errors = [];
const check = (n, ok, d = "") => {
  results.push([n, ok, d]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  [${d}]` : ""}`);
};

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const signUpSubmit = (p) => p.locator('form button[type="submit"]').first();

async function acceptTerms(p) {
  // Idempotent: only tick the box when it is not already ticked (the state
  // survives going back to the details step).
  const box = p.locator('label:has-text("Terms of Service") input[type="checkbox"]').first();
  if (await box.count()) {
    if (!(await box.isChecked().catch(() => false))) await box.check({ force: true }).catch(() => {});
    return;
  }
  const label = p.locator("label", { hasText: /Terms of Service/i }).first();
  if (await label.count()) await label.click().catch(() => {});
}

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|DevTools|websocket|hydrat/i.test(m.text()))
      errors.push(`console: ${m.text().slice(0, 200)}`);
  });

  // ============================================================ (a) SIGN IN
  await page.goto(`${BASE}/auth/sign-in`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/50-signin.png` });

  check("a1 signin: email + password fields present",
    (await page.locator("#email").isVisible()) && (await page.locator("#password").isVisible()));
  check("a2 signin: no captcha on the sign-in page",
    (await page.locator("#captcha-answer").count()) === 0);
  check("a3 signin: remember-device + forgot-password present",
    (await page.locator("text=Remember this device").count()) === 1 &&
    (await page.locator("text=Forgot password?").count()) === 1);

  // Google: unconfigured backend -> button exists and is disabled with a reason.
  const googleBtn = page.getByRole("button", { name: /Continue with Google/i }).first();
  check("a4 signin: Google button rendered", (await googleBtn.count()) === 1);
  check("a5 signin: Google button DISABLED when unconfigured", await googleBtn.isDisabled());
  const gTitle = (await googleBtn.getAttribute("title")) || "";
  check("a6 signin: Google disabled reason names GOOGLE_CLIENT_ID",
    /GOOGLE_CLIENT_ID/.test(gTitle), gTitle.slice(0, 70));
  const stillOnSignIn = !page.url().includes("/dashboard");
  // A disabled button cannot fake a login: click it (force) and stay put.
  await googleBtn.click({ force: true }).catch(() => {});
  await page.waitForTimeout(1200);
  check("a7 signin: disabled Google button logs nobody in",
    stillOnSignIn && !page.url().includes("/dashboard"), page.url());

  // Demo scholar is a separate, clearly-labelled control.
  const demoBtn = page.getByRole("button", { name: /Continue as demo scholar/i }).first();
  check("a8 signin: separate 'Continue as demo scholar' button", (await demoBtn.count()) === 1);
  check("a9 signin: 'Fill demo credentials' helper kept",
    (await page.locator("text=Fill demo credentials").count()) === 1);

  // ======================================================= (d) DEMO -> DASH
  await demoBtn.click();
  await page.waitForURL("**/dashboard", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  check("d1 demo login reaches /dashboard", page.url().includes("/dashboard"), page.url());
  await page.screenshot({ path: `${OUT}/51-dashboard.png` });

  const tokenOk = await page.evaluate(() => !!localStorage.getItem("ai2latex.token"));
  check("d2 demo login stored a real session token", tokenOk);
  await page.evaluate(() => localStorage.removeItem("ai2latex.token"));

  // =========================================== (b)(c) SIGN-UP CAPTCHA (live)
  await page.goto(`${BASE}/auth/sign-up`, { waitUntil: "networkidle" });
  await page.waitForSelector("#captcha-answer", { timeout: 20000 });
  await page.waitForSelector('img[src^="data:image/png"]', { timeout: 20000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/52-signup.png` });

  const capImg = page.locator('img[src^="data:image/png"]').first();
  check("b1 signup: captcha IMAGE rendered", (await capImg.count()) === 1);
  const firstSrc = (await capImg.getAttribute("src")) || "";
  check("b2 signup: captcha src is a png data-uri",
    firstSrc.startsWith("data:image/png;base64,"), firstSrc.slice(0, 34));

  const capBox = page.locator("#captcha-answer");
  check("b3 signup: captcha answer input labelled 'Enter the characters shown'",
    (await capBox.getAttribute("aria-label")) === "Enter the characters shown");

  const refresh = page.getByRole("button", { name: "Get a new captcha" });
  check("b4 signup: refresh button has aria-label 'Get a new captcha'",
    (await refresh.count()) === 1);
  await refresh.click();
  await page.waitForTimeout(2200);
  const secondSrc = (await page.locator('img[src^="data:image/png"]').first().getAttribute("src")) || "";
  check("b5 signup: refresh loads a DIFFERENT captcha image",
    !!secondSrc && secondSrc !== firstSrc);

  // (c) deliberately wrong captcha answer -> visible error (live backend 400)
  const stamp = Date.now().toString().slice(-7);
  await page.fill("#name", "Captcha Tester");
  await page.fill("#email", `cap${stamp}@uni.edu`);
  await page.fill("#password", "password123");
  await acceptTerms(page);
  await capBox.fill("ZZZZZ");
  await signUpSubmit(page).click();
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${OUT}/53-captcha-error.png` });

  const alerts = await page.locator('[role="alert"]').allInnerTexts().catch(() => []);
  check("c1 signup: wrong captcha shows role=alert error",
    /captcha/i.test(alerts.join(" ")), alerts.join(" | ").slice(0, 90));

  // Still on step 1 (no verification step) and the answer box was cleared.
  check("c2 signup: stays on the details step after a bad captcha",
    (await page.locator("#captcha-answer").count()) === 1 && (await page.locator("#email").count()) === 1);
  check("c3 signup: captcha answer cleared after rejection",
    (await page.inputValue("#captcha-answer")) === "");

  // ============================== (e) VERIFICATION STEP — UI CONTRACT, STUBBED
  // A real devCode needs a solved CAPTCHA; the backend intentionally exposes no
  // answer. Stub signup so the step-2 contract (6 boxes, paste, banner, resend
  // countdown, change-email) can be verified.
  const page2 = await ctx.newPage();
  page2.on("pageerror", (e) => errors.push(`pageerror2: ${e.message.slice(0, 150)}`));
  await page2.route("**/api/auth/captcha", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "cap-test1234", image: PNG_1PX, expiresIn: 300 }),
    }),
  );
  await page2.route("**/api/auth/signup", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        needsVerification: true,
        pendingToken: "stub-pending-token",
        email: "stub@uni.edu",
        emailDelivery: "dev",
        devCode: "428193",
      }),
    }),
  );

  await page2.goto(`${BASE}/auth/sign-up`, { waitUntil: "networkidle" });
  await page2.waitForTimeout(1500);
  await page2.fill("#name", "Stub User");
  await page2.fill("#email", "stub@uni.edu");
  await page2.fill("#password", "password123");
  await acceptTerms(page2);
  await page2.fill("#captcha-answer", "K7QP2");
  await signUpSubmit(page2).click();
  await page2.waitForFunction(() => document.querySelectorAll('input[inputmode="numeric"]').length >= 6,
    null, { timeout: 15000 }).catch(() => {});
  await page2.waitForTimeout(600);
  await page2.screenshot({ path: `${OUT}/54-verify-step.png` });

  const codeInputs = page2.locator('input[inputmode="numeric"]');
  check("e1 verify: SIX single-digit boxes rendered", (await codeInputs.count()) === 6,
    `${await codeInputs.count()} inputs`);

  const label0 = (await codeInputs.nth(0).getAttribute("aria-label")) || "";
  check("e2 verify: code boxes are labelled", /verification code digit 1/i.test(label0), label0);

  const focusedIsFirst = await page2.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll('input[inputmode="numeric"]'));
    return boxes.length === 6 && document.activeElement === boxes[0];
  });
  check("e3 verify: first code box focused on step change", focusedIsFirst);

  const p2body = await page2.locator("body").innerText();
  check("e4 verify: dev banner says 'No email is sent in the prototype'",
    /No email is sent in the prototype/i.test(p2body));
  check("e5 verify: dev banner shows the devCode 428193", /428193/.test(p2body));
  check("e6 verify: banner only shown for emailDelivery=dev",
    (await page2.locator('[data-testid="dev-code-banner"]').count()) === 1);

  // Paste all six digits at once into the first box.
  await codeInputs.nth(0).focus();
  await page2.evaluate(() => {
    const box = document.querySelector('input[inputmode="numeric"]');
    const dt = new DataTransfer();
    dt.setData("text", "428193");
    box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page2.waitForTimeout(300);
  const pasted = await page2.evaluate(() =>
    Array.from(document.querySelectorAll('input[inputmode="numeric"]')).map((i) => i.value).join(""));
  check("e7 verify: paste fills all 6 boxes", pasted === "428193", pasted);

  // Resend: 30s countdown, announced via aria-live.
  const live = page2.locator('[aria-live="polite"]').first();
  const liveText = ((await live.innerText().catch(() => "")) || "").trim();
  check("e8 verify: resend countdown announced with aria-live",
    /resend in \d+s/i.test(liveText), liveText);
  const resendBtn = page2.getByRole("button", { name: /resend code/i }).first();
  check("e9 verify: resend disabled during the 30s cooldown", await resendBtn.isDisabled());

  // Change-email escape returns to step 1.
  await page2.getByRole("button", { name: /change email/i }).first().click();
  await page2.waitForTimeout(500);
  check("e10 verify: 'change email' returns to the details step",
    (await page2.locator("#email").count()) === 1 && (await page2.locator("#captcha-answer").count()) === 1);

  // Wrong code -> server error surfaced via role=alert (live backend: the stub
  // pendingToken is invalid, so verify-email returns 401).
  await page2.fill("#name", "Stub User");
  await page2.fill("#email", "stub@uni.edu");
  await page2.fill("#password", "password123");
  await acceptTerms(page2);
  await page2.fill("#captcha-answer", "K7QP2");
  await signUpSubmit(page2).click();
  await page2.waitForFunction(() => document.querySelectorAll('input[inputmode="numeric"]').length >= 6,
    null, { timeout: 15000 }).catch(() => {});
  for (let i = 0; i < 6; i += 1) await page2.locator('input[inputmode="numeric"]').nth(i).fill("0");
  await page2.locator('form button[type="submit"]').first().click();
  await page2.waitForTimeout(2500);
  const verifyAlerts = await page2.locator('[role="alert"]').allInnerTexts().catch(() => []);
  check("e11 verify: bad code shows role=alert error",
    /incorrect|expired|no longer valid|invalid/i.test(verifyAlerts.join(" ")),
    verifyAlerts.join(" | ").slice(0, 90));
  await page2.screenshot({ path: `${OUT}/55-verify-error.png` });

  // ============================ (f) UNVERIFIED LOGIN -> VERIFICATION (STUBBED)
  const page3 = await ctx.newPage();
  page3.on("pageerror", (e) => errors.push(`pageerror3: ${e.message.slice(0, 150)}`));
  await page3.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "Verify your email before signing in.",
        status: 403,
        needsVerification: true,
        pendingToken: "stub-pending-login",
        emailDelivery: "dev",
        devCode: "903214",
      }),
    }),
  );
  await page3.goto(`${BASE}/auth/sign-in`, { waitUntil: "networkidle" });
  await page3.fill("#email", "pending@uni.edu");
  await page3.fill("#password", "password123");
  await page3.locator('form button[type="submit"]').first().click();
  await page3.waitForTimeout(2200);
  await page3.screenshot({ path: `${OUT}/56-login-needs-verification.png` });

  check("f1 unverified login: lands on the verification step",
    (await page3.locator('input[inputmode="numeric"]').count()) === 6);
  const f1body = await page3.locator("body").innerText();
  check("f2 unverified login: shows the devCode from the 403 body", /903214/.test(f1body));
  const f1alerts = await page3.locator('[role="alert"]').allInnerTexts().catch(() => []);
  check("f3 unverified login: NO red 'verify your email' error is shown",
    !/verify your email before signing in/i.test(f1alerts.join(" ")), f1alerts.join(" | ").slice(0, 70));

  await browser.close();
  console.log("\n=== console/page errors ===");
  console.log(errors.length ? errors.slice(0, 10).join("\n") : "none");
  const failed = results.filter((r) => !r[1]);
  console.log(`\n${results.length - failed.length}/${results.length} auth UI checks passed`);
  if (failed.length) {
    console.log("FAILED:");
    failed.forEach(([n, , d]) => console.log(`  - ${n} [${d}]`));
  }
  console.log(
    "\nNOTE: e1-e11 and f1-f3 use page.route stubs (UI contract tests); every other check runs against the live backend.",
  );
  process.exit(failed.length === 0 ? 0 : 1);
})();
