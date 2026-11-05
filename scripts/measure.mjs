// npm run measure : layout measurements at the five breakpoints, both contract-address branches. Screenshots go to reports/.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { root, serve, launch, openPage, market, settle, sleep, counted, TEST_CA } from "./lib.mjs";

const WIDTHS = [360, 390, 430, 1366, 1440];
const out = join(root, "reports"); mkdirSync(out, { recursive: true });
const STATED = (j) => { const g = (id) => j.records.find((r) => r.id === id); Object.assign(g("ca"), { state: "stated", value: TEST_CA }); Object.assign(g("x"), { state: "stated", url: "https://x.com/migrate_test" }); Object.assign(g("github"), { state: "stated", url: "https://github.com/migrate-test/site" }); return j; };

const { srv, origin } = await serve();
const browser = await launch();
let failures = 0;
const rows = [];

for (const [label, reg] of [["absent", undefined], ["stated", STATED]]) {
  for (const w of WIDTHS) {
    const h = w < 700 ? 800 : 900;
    const { page } = await openPage(browser, origin, { width: w, height: h, market: market({ ownCA: TEST_CA, ownInBoosts: true }), register: reg });
    await settle(page, "[data-row]", 9);
    if (reg) await page.waitForFunction(() => document.querySelector("[data-own-row] [data-cell=price]")?.textContent.includes("0.0"), { timeout: 9000 });
    await counted(page); await sleep(700);
    const m = await page.evaluate(() => {
      const vw = innerWidth, de = document.documentElement;
      const r = (el) => el.getBoundingClientRect();
      const vis = (el) => { const c = getComputedStyle(el), b = r(el); return c.display !== "none" && c.visibility !== "hidden" && b.width > 0 && b.height > 0; };
      const inter = [...document.querySelectorAll("a[href], button, [role=tab], [role=button], input, select, textarea")].filter(vis).filter((el) => !el.disabled);
      const small = inter.filter((el) => { const b = r(el); return b.width < 43.5 || b.height < 43.5; }).map((el) => (el.getAttribute("aria-label") || el.textContent.trim().slice(0, 20) || el.tagName) + " " + Math.round(r(el).width) + "x" + Math.round(r(el).height));
      const over = [...document.querySelectorAll("body *")].filter((el) => !el.closest(".ticker") && !el.closest(".mesh") && el.id !== "spot" && el.id !== "navpill" && !el.closest(".hero-art") && vis(el)).filter((el) => r(el).right > vw + 1 || r(el).left < -1).map((el) => el.tagName + "." + (el.className && el.className.baseVal === undefined ? String(el.className).split(" ")[0] : "")).slice(0, 5);
      const ca = document.querySelector("#ca"), cv = document.querySelector("[data-ca-value]"), cvs = getComputedStyle(cv);
      const lh = parseFloat(cvs.lineHeight) || parseFloat(cvs.fontSize) * 1.25;
      const soc = ["x", "github"].map((i) => { const b = r(document.querySelector('[data-social="' + i + '"]')); return { l: Math.round(b.left), t: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(vw - b.right) }; });
      const row = document.querySelector("[data-row]"), own = document.querySelector("[data-own-row]");
      const fonts = new Set(); const wk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); while (wk.nextNode()) { const t = wk.currentNode; if (t.nodeValue.trim() && t.parentElement && vis(t.parentElement) && !t.parentElement.closest(".sr-only")) fonts.add(parseFloat(getComputedStyle(t.parentElement).fontSize)); }
      return { vw, scrollW: de.scrollWidth, overflowX: de.scrollWidth - vw, caH: Math.round(r(ca).height), caFs: parseFloat(cvs.fontSize), caLines: Math.round(r(cv).height / lh), caClip: cv.scrollWidth > cv.clientWidth + 1, caText: cv.textContent.length, topbarH: Math.round(r(document.querySelector(".topbar")).height), soc, rowH: Math.round(r(row).height), ownH: Math.round(r(own).height), h1: parseFloat(getComputedStyle(document.querySelector("h1")).fontSize), minFont: Math.min(...fonts), small, over, tabbar: vis(document.querySelector(".tabbar")), nav: vis(document.querySelector(".nav-desk")), pageH: de.scrollHeight };
    });
    await page.screenshot({ path: join(out, "measure-" + label + "-" + w + ".png"), fullPage: false });
    if (w === 1440 || w === 390) await page.screenshot({ path: join(out, "full-" + label + "-" + w + ".png"), fullPage: true });
    const bad = m.overflowX > 0 || m.small.length || m.over.length || m.soc.some((s) => s.w < 44 || s.h < 44 || s.l < w / 2) || m.caClip;
    if (bad) failures++;
    rows.push([label, w, m.overflowX, m.caH + "/" + m.caFs + "px/" + m.caLines + "L", m.topbarH, m.soc.map((s) => s.w + "x" + s.h + "@r" + s.r).join(" "), m.rowH + "/" + m.ownH, m.h1, m.minFont, m.tabbar ? "tabbar" : "nav", m.small.length ? "SMALL " + m.small.join("; ") : "taps ok", m.over.length ? "OVER " + m.over.join(",") : "fits", bad ? "FAIL" : "ok"]);
    await page.close();
  }
}
console.log(["branch", "vw", "xOverflow", "CA h/font/lines", "bar", "social WxH@right", "row/own h", "h1", "minFont", "nav", "taps", "bounds", "result"].join(" | "));
rows.forEach((r) => console.log(r.join(" | ")));
console.log("\nmeasure: " + rows.length + " layouts, " + failures + " with problems. Screenshots in reports/");
await browser.close(); srv.close();
process.exit(failures ? 1 : 0);
