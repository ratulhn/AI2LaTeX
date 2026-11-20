const { chromium } = require("playwright");
const BASE = "http://127.0.0.1:3101";
const OUT = "C:/Users/User/AppData/Local/Temp/ai2latex-shots";
const results = [];
const errors = [];
const check = (n, ok, d = "") => {
  results.push([n, ok, d]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  [${d}]` : ""}`);
};

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

  // ---------------- SIGN IN PAGE
  await page.goto(`${BASE}/auth/sign-in`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/50-signin.png` });

  check("signin: email field present", await page.locator("#email").isVisible());
  check("signin: password field present", await page.locator("#password").isVisible());

  // Google button must exist and be DISABLED (no GOOGLE_CLIENT_ID)
  const googleBtn = page.locator("button", { hasText: /Continue with Google/i }).first();
  const hasGoogle = (await googleBtn.count()) > 0;
  check("signin: Google button rendered", hasGoogle);
  if (hasGoogle) {
    const disabled = await googleBtn.isDisabled();
    check("signin: Google button disabled when unconfigured", disabled);
    const title = await googleBtn.getAttribute("title");
    check("signin: Google disabled reason shown", /GOOGLE_CLIENT_ID/i.test(title || ""), (title || "").slice(0, 60));
  }

  // Demo scholar must be a SEPARATE control
  const demoBtn = page.locator("button", { hasText: /demo scholar/i }).first();
  check("signin: separate demo-scholar button", (await demoBtn.count()) > 0);

  // ---------------- DEMO LOGIN -> dashboard
  if (await demoBtn.count()) {
    await demoBtn.click();
    await page.waitForURL("**/dashboard", { timeout: 30000 }).catch(() => {});
    check("demo login reaches dashboard", page.url().includes("/dashboard"), page.url());
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${OUT}/51-dashboard.png` });
  }

  // ---------------- SIGN UP: captcha renders (logged-out state; a signed-in
  // visitor is correctly redirected to /dashboard by the sign-up page)
  await page.evaluate(() => localStorage.removeItem("ai2latex.token"));
  await page.goto(`${BASE}/auth/sign-up`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !!document.querySelector("#captcha-answer"), null, { timeout: 20000 });
  await page.waitForSelector('img[src^="data:image/png"]', { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/52-signup.png` });

  const capImg = page.locator('img[src^="data:image/png"]').first();
  const capCount = await capImg.count();
  check("signup: captcha image rendered", capCount > 0, `${capCount} images`);
  let firstSrc = null;
  if (capCount) {
    firstSrc = await capImg.getAttribute("src");
    check("signup: captcha is a png data-uri", (firstSrc || "").startsWith("data:image/png"));
  }

  // refresh button changes the captcha
  const refresh = page.locator('button[aria-label*="captcha" i], button[aria-label*="new captcha" i], button[aria-label*="refresh" i]').first();
  const hasRefresh = (await refresh.count()) > 0;
  check("signup: captcha refresh button present", hasRefresh);
  if (hasRefresh && firstSrc) {
    await refresh.click();
    await page.waitForTimeout(2000);
    const secondSrc = await page.locator('img[src^="data:image/png"]').first().getAttribute("src");
    check("signup: refresh loads a new captcha", secondSrc !== firstSrc && !!secondSrc);
  }

  // captcha answer input exists and is labelled
  const capInput = page.locator("#captcha-answer");
  const hasCapInput = (await capInput.count()) > 0;
  check("signup: captcha answer input labelled", hasCapInput);

  // ---------------- WRONG CAPTCHA -> visible error
  const stamp = Date.now().toString().slice(-7);
  const email = `cap${stamp}@uni.edu`;
  await page.fill("#name", "Captcha Tester");
  await page.fill("#email", email);
  await page.fill("#password", "password123");
  // accept terms if a checkbox exists
  const terms = page.locator("label", { hasText: /Terms of Service/i }).first();
  if (await terms.count()) await terms.click().catch(() => {});
  if (hasCapInput) await capInput.fill("ZZZZZ");
  const submit = page.locator('form button[type="submit"], button:has-text("Continue")').first();
  await submit.click().catch(() => {});
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${OUT}/53-captcha-error.png` });
  const alertText = await page.locator('[role="alert"]').allInnerTexts().catch(() => []);
  const bodyTxt = await page.locator("body").innerText();
  const captchaRejected = /captcha/i.test(alertText.join(" ") + bodyTxt);
  check("signup: wrong captcha shows an error", captchaRejected, (alertText.join(" ") || bodyTxt).slice(0, 80).replace(/\n/g, " "));

  // ---------------- VERIFICATION STEP (route-stubbed, UI contract only)
  const page2 = await ctx.newPage();
  page2.on("pageerror", (e) => errors.push(`pageerror2: ${e.message.slice(0, 150)}`));
  await page2.route("**/api/auth/captcha", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "cap-test1234",
        image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        expiresIn: 300,
      }),
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
  await page2.waitForFunction(() => !!document.querySelector("#captcha-answer"), null, { timeout: 20000 });
  await page2.waitForTimeout(400);
  await page2.fill("#name", "Stub User");
  await page2.fill("#email", "stub@uni.edu");
  await page2.fill("#password", "password123");
  const t2 = page2.locator("label", { hasText: /Terms of Service/i }).first();
  if (await t2.count()) await t2.click().catch(() => {});
  const capIn2 = page2.locator("#captcha-answer");
  if (await capIn2.count()) await capIn2.fill("K7QP2");
  const sub2 = page2.locator('button:has-text("Continue · verify email")').first();
  await sub2.click();
  await page2.waitForFunction(() => document.querySelectorAll('input[inputmode="numeric"]').length >= 6, null, { timeout: 15000 }).catch(() => {});
  await page2.waitForTimeout(500);
  await page2.screenshot({ path: `${OUT}/54-verify-step.png` });

  const codeInputs = await page2.locator('input[inputmode="numeric"]').count();
  check("verify step: six code inputs", codeInputs >= 6, `${codeInputs} inputs`);
  const p2body = await page2.locator("body").innerText();
  check("verify step: dev-code banner shown", /428193/.test(p2body));
  check("verify step: no-email notice shown", /no email is sent|prototype/i.test(p2body));

  // wrong code -> error, real API for verify is NOT stubbed so this hits backend and must fail cleanly
  const inputs = page2.locator('input[inputmode="numeric"]');
  for (let i = 0; i < Math.min(6, codeInputs); i++) await inputs.nth(i).fill("0");
  const verifyBtn = page2.locator('button:has-text("Verify")').first();
  await verifyBtn.click().catch(() => {});
  await page2.waitForTimeout(2500);
  const p2after = await page2.locator("body").innerText();
  check("verify step: wrong code reports an error", /incorrect|invalid|expired|no longer valid/i.test(p2after),
    p2after.slice(0, 100).replace(/\n/g, " "));

  await browser.close();
  console.log("\n=== console/page errors ===");
  console.log(errors.length ? errors.slice(0, 10).join("\n") : "none");
  const failed = results.filter((r) => !r[1]);
  console.log(`\n${results.length - failed.length}/${results.length} auth UI checks passed`);
  if (failed.length) {
    console.log("FAILED:");
    failed.forEach(([n, , d]) => console.log(`  - ${n} [${d}]`));
  }
  process.exit(failed.length === 0 ? 0 : 1);
})();
