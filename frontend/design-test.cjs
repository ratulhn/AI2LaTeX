const { chromium } = require("playwright");
const BASE = "http://127.0.0.1:3101";
const results = [];
const check = (n, ok, d = "") => {
  results.push([n, ok, d]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  [${d}]` : ""}`);
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();

  // ---------- design tokens present in CSS custom properties
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const vars = await p.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    const names = [
      "--color-canvas", "--color-panel", "--color-border", "--color-ink", "--color-muted",
      "--color-blue", "--color-blue-hover", "--color-success", "--color-warning",
      "--color-ai", "--color-watermark", "--font-ui", "--font-paper", "--font-code",
    ];
    return Object.fromEntries(names.map((n) => [n, s.getPropertyValue(n).trim()]));
  });
  const expectVars = {
    "--color-canvas": "#f8fafc",
    "--color-panel": "#fff",
    "--color-border": "#e2e8f0",
    "--color-ink": "#0f172a",
    "--color-muted": "#64748b",
    "--color-blue": "#2563eb",
    "--color-blue-hover": "#1d4ed8",
    "--color-success": "#10b981",
    "--color-warning": "#f59e0b",
    "--color-ai": "#7c3aed",
    "--color-watermark": "#94a3b8",
  };
  for (const [k, v] of Object.entries(expectVars)) {
    check(`token ${k}`, vars[k].toLowerCase() === v, `${vars[k]}`);
  }
  check("paper font is a serif stack", /Tinos|serif/i.test(vars["--font-paper"]), vars["--font-paper"].slice(0, 60));
  check("code font is mono", /mono|JetBrains/i.test(vars["--font-code"]), vars["--font-code"].slice(0, 50));

  // ---------- landing layout
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const hero = await p.evaluate(() => {
    const h1 = document.querySelector("h1");
    const cs = getComputedStyle(h1);
    return { size: cs.fontSize, weight: cs.fontWeight, color: cs.color, family: cs.fontFamily.slice(0, 40) };
  });
  check("hero is large & semibold", parseInt(hero.size) >= 36 && Number(hero.weight) >= 600, `${hero.size}/${hero.weight}`);
  check("hero uses ink colour", hero.color === "rgb(15, 23, 42)", hero.color);

  // ---------- dashboard structure
  await p.goto(`${BASE}/auth/sign-in`, { waitUntil: "networkidle" });
  await p.click("text=Fill demo credentials");
  await p.locator('button[type="submit"]').click();
  await p.waitForURL("**/dashboard", { timeout: 25000 });
  await p.waitForTimeout(1800);

  const dash = await p.evaluate(() => {
    const cards = [...new Set([...document.querySelectorAll('a[href^="/workspace/"]')].map(a => a.closest(".group")))].filter(Boolean);
    const grid = cards[0]?.closest("div.grid") ?? cards[0]?.parentElement;
    const gs = grid ? getComputedStyle(grid) : null;
    return {
      cardCount: cards.length,
      gridCols: gs?.gridTemplateColumns,
      gap: gs?.gap,
      headerH: document.querySelector("header")?.getBoundingClientRect().height,
    };
  });
  // At least the three seeded projects; other suites may leave extra scratch cards.
  check("dashboard shows the seeded project cards", dash.cardCount >= 3, `${dash.cardCount}`);
  check("project grid uses 3 columns", (dash.gridCols?.split(" ").length ?? 0) === 3, dash.gridCols);
  check("header height ~58px", Math.abs((dash.headerH ?? 0) - 58) < 2, `${dash.headerH}px`);

  // create&import cards
  const importCards = await p.locator("text=Create & import").count();
  check("create & import section", importCards === 1);

  // ---------- workspace layout
  await p.goto(`${BASE}/workspace/prj-networks`, { waitUntil: "networkidle" });
  await p.waitForSelector('input[aria-label="Document title"]', { timeout: 30000 });
  await p.waitForTimeout(3000);

  const ws = await p.evaluate(() => {
    const canvas = document.querySelector(".paper");
    const frame = canvas?.closest("div.rounded-\\[3px\\]");
    const cs = canvas ? getComputedStyle(canvas) : null;
    const header = document.querySelector("header");
    const asides = [...document.querySelectorAll("aside")].map((a) => a.getBoundingClientRect().width);
    return {
      canvasWidth: frame?.getBoundingClientRect().width,
      paperFont: cs?.fontFamily.slice(0, 30),
      paperSize: cs?.fontSize,
      accent: cs?.getPropertyValue("--accent").trim(),
      outlineW: asides[0],
      chatW: asides[1],
      headerH: header?.getBoundingClientRect().height,
      sectionColor: (() => { const i = [...document.querySelectorAll("input")].find(x => x.value === "Transport Layer Protocols"); return i ? getComputedStyle(i).color : null; })(),
      justify: (() => {
        const para = [...document.querySelectorAll(".paper p")].find((x) => x.textContent.length > 120);
        return para ? getComputedStyle(para).textAlign : null;
      })(),
    };
  });
  check("canvas is ~700px wide", Math.abs((ws.canvasWidth ?? 0) - 760) <= 8 || Math.abs((ws.canvasWidth ?? 0) - 700) <= 60, `${ws.canvasWidth}px`);
  check("paper uses serif font", /Tinos|serif/i.test(ws.paperFont), ws.paperFont);
  check("paper body is 11px", ws.paperSize === "11px", ws.paperSize);
  check("accent is navy #002855", ws.accent.toUpperCase() === "#002855", ws.accent);
  check("section title input uses accent colour", ws.sectionColor === "rgb(0, 40, 85)", ws.sectionColor);
  check("body paragraphs justified", ws.justify === "justify", ws.justify);
  check("outline rail ~196px", Math.abs((ws.outlineW ?? 0) - 196) < 3, `${ws.outlineW}px`);
  check("chat pane ~340px", Math.abs((ws.chatW ?? 0) - 340) < 3, `${ws.chatW}px`);
  check("workspace header ~52px", Math.abs((ws.headerH ?? 0) - 52) < 3, `${ws.headerH}px`);

  // ---------- source editor colours
  await p.click("text=Source Editor");
  await p.waitForTimeout(1400);
  const src = await p.evaluate(() => {
    const btns = [...document.querySelectorAll("span")].filter((s) => s.textContent === "main.tex");
    const pane = document.querySelector(".code-editor");
    const tok = document.querySelector(".tok-cmd");
    return {
      hasTab: btns.length > 0,
      bg: (() => {
        let el = pane?.parentElement;
        while (el) {
          const c = getComputedStyle(el).backgroundColor;
          if (c === "rgb(15, 23, 42)") return c;
          el = el.parentElement;
        }
        return null;
      })(),
      tokColor: tok ? getComputedStyle(tok).color : null,
    };
  });
  check("source editor dark panes", src.bg === "rgb(15, 23, 42)", String(src.bg));
  check("syntax command colour blue-400", src.tokColor === "rgb(96, 165, 250)", String(src.tokColor));
  check("main.tex tab present", src.hasTab);

  // ---------- split view: source left, pdf right
  await p.click("text=Split PDF View");
  await p.waitForTimeout(1800);
  const split = await p.evaluate(() => {
    const grid = [...document.querySelectorAll("div")].find((d) => {
      const cs = getComputedStyle(d);
      return cs.display === "grid" && cs.gridTemplateColumns.split(" ").length === 2 && d.querySelector("iframe");
    });
    if (!grid) return null;
    const [a, b] = grid.children;
    return {
      cols: getComputedStyle(grid).gridTemplateColumns,
      leftIsEditor: !!a.querySelector(".code-editor"),
      rightIsPdf: !!b.querySelector("iframe"),
      iframeSrc: b.querySelector("iframe")?.getAttribute("src"),
    };
  });
  check("split view is a 2-column grid", !!split, JSON.stringify(split?.cols));
  check("split: source on the left", split?.leftIsEditor === true);
  check("split: pdf preview on the right", split?.rightIsPdf === true);
  check("pdf iframe carries auth token", /[?&]token=/.test(split?.iframeSrc ?? ""), (split?.iframeSrc ?? "").slice(0, 60));

  // ---------- modals match reference copy
  await p.click("text=Visual Editor");
  await p.waitForTimeout(900);

  await p.click("text=Version history");
  await p.waitForTimeout(1200);
  const vtext = await p.locator('[role="dialog"]').innerText();
  check("versions modal copy", vtext.includes("Restoring a version keeps your current work in history"));
  check("versions modal has restore action", vtext.includes("Restore Selected Version"));
  await p.keyboard.press("Escape");

  await p.click("text=AI Polish");
  await p.waitForTimeout(900);
  const ptext = await p.locator('[role="dialog"]').innerText();
  check("polish modal copy", ptext.includes("Stronger academic writing"));
  check("polish has 4 refinement options",
    ["Fix grammar & academic tone", "Harmonize heading hierarchy", "Standardize math symbols", "Remove redundant snippets"]
      .every((s) => ptext.includes(s)));
  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);

  // typography modal
  await p.click("text=Page style");
  await p.waitForTimeout(900);
  const ttext = await p.locator('[role="dialog"]').innerText();
  check("typography modal has font search", ttext.toLowerCase().includes("font family"));
  check("typography modal lists 4 accent themes",
    ["Academic Navy", "Oxford Crimson", "Forest Green", "Classic Charcoal"].every((s) => ttext.includes(s)));
  check("typography modal shows hex codes", ttext.includes("#002855") && ttext.includes("#800020"));
  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);

  // figure modal
  await p.locator('button[aria-label="Insert image"]').first().click();
  await p.waitForTimeout(900);
  const ftext = await p.locator('[role="dialog"]').innerText();
  check("figure modal mentions drag & drop", /Drag and drop|Drop a file/.test(ftext));
  check("figure modal has layout widths", ftext.includes("50% Column") && ftext.includes("80% Text-Width"));
  check("figure modal offers vectorize", ftext.includes("Improve image with AI"));
  await p.keyboard.press("Escape");

  // ---------- upgrade modal
  await p.goto(`${BASE}/pricing`, { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  const prices = await p.evaluate(() =>
    [...document.querySelectorAll("span")].map((s) => s.textContent.trim()).filter((t) => /^\$\d/.test(t)),
  );
  check("pricing shows 3 tiers", prices.length === 3, prices.join(","));
  check("pricing includes $7.99 and $19.99", prices.includes("$7.99") && prices.includes("$19.99"));

  // ---------- responsive breakpoints
  for (const [w, h, label] of [[1280, 800, "laptop"], [1024, 768, "small laptop"], [768, 1024, "tablet"], [390, 844, "phone"]]) {
    await p.setViewportSize({ width: w, height: h });
    await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    check(`no horizontal overflow at ${label} (${w}px)`, !overflow);
  }

  await b.close();
  const failed = results.filter((r) => !r[1]);
  console.log(`\n${results.length - failed.length}/${results.length} design checks passed`);
  if (failed.length) {
    console.log("FAILED:");
    failed.forEach(([n, , d]) => console.log(`  - ${n} ${d}`));
  }
  process.exit(failed.length === 0 ? 0 : 1);
})();
