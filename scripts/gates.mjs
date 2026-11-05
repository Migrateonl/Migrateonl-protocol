// npm run gates : static gates over src/ and dist/, then browser gates for both contract-address branches.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import crypto from "node:crypto";
import { root, dist, serve, launch, openPage, market, settle, sleep, counted, TEST_CA, TEST_EVM, fakeAddr } from "./lib.mjs";

const results = [];
let section = "";
function gate(id, desc, pass, detail = "") { results.push({ id, desc, pass: !!pass, detail }); console.log((pass ? "  pass " : "  FAIL ") + id + "  " + desc + (detail && !pass ? "\n         -> " + detail : "")); }
const head = (t) => { section = t; console.log("\n" + t); };

const read = (p) => readFileSync(p, "utf8");
function walk(dir, skip = []) {
  const out = [];
  for (const n of readdirSync(dir)) {
    if (skip.includes(n)) continue;
    const p = join(dir, n), s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p, skip)); else out.push(p);
  }
  return out;
}
const TEXT = new Set([".html", ".css", ".js", ".mjs", ".json", ".md", ".svg", ".txt", ".py", ".toml", ""]);
const rel = (p) => relative(root, p).replace(/\\/g, "/");

const tokens = JSON.parse(read(join(root, "src", "tokens.json")));
const tokenHex = new Set(Object.entries(tokens).filter(([k]) => !k.startsWith("_")).map(([, v]) => v.value.toLowerCase()));
const HEX = /#[0-9a-fA-F]{3,8}\b/g;

// ===================================================================================== static
head("STATIC");
const need = ["index.html", "register.json", "favicon.svg", "css/tokens.css", "css/styles.css", "js/main.js", "js/register.js", "js/market.js", "js/ui.js", "js/motion.js", "js/format.js", "assets/logo-192.png", "assets/logo-96.png", "assets/migrate-logo.png", "assets/apple-touch-icon.png", "fonts/hanken-grotesk.woff2", "fonts/geist-mono.woff2", "fonts/sora-700.woff2", "_headers"];
const missing = need.filter((f) => !existsSync(join(dist, f)));
gate("S01", "dist/ holds every deploy file", missing.length === 0, missing.join(", "));
gate("S02", "brand/migrate-logo.png exists and dist has no repo docs", existsSync(join(root, "brand", "migrate-logo.png")) && !["README.md", "LICENSE", "docs"].some((f) => existsSync(join(dist, f))));

const forbidden = ["CLAUDE.md", ".claude", "claude.md"].filter((f) => existsSync(join(root, f)) || existsSync(join(dist, f)));
gate("S03", "repo hygiene: no agent config files or folders", forbidden.length === 0, forbidden.join(", "));

const bad = [["cla", "ude"], ["anthr", "opic"], ["co-authored", "-by"], ["generated ", "with"], ["ai-", "generated"], ["chat", "gpt"]].map((p) => p.join(""));
const scan = walk(root, ["node_modules", "brand", "reference", ".git", "reports"]).filter((p) => TEXT.has(extname(p)) && !p.endsWith("ref-fingerprint.json") && !p.endsWith("gates.mjs"));
const hits = [];
for (const f of scan) { const t = read(f).toLowerCase(); for (const b of bad) if (t.includes(b)) hits.push(rel(f) + ":" + b); if (/\bai\b/.test(t.replace(/\bsaid\b/g, ""))) hits.push(rel(f) + ":AI"); }
gate("S04", "no AI attribution anywhere in text files", hits.length === 0, hits.slice(0, 6).join(", "));

const srcFiles = walk(join(root, "src")).filter((p) => !p.endsWith("tokens.json"));
const hexIn = [];
for (const f of srcFiles) { const m = read(f).match(HEX); if (m) hexIn.push(rel(f) + " " + m.slice(0, 3).join(",")); }
for (const f of ["README.md", "docs/whitepaper.md"]) { if (existsSync(join(root, f)) && HEX.test(read(join(root, f)))) hexIn.push(f); HEX.lastIndex = 0; }
gate("S05", "colour literals live only in src/tokens.json (none elsewhere in src/)", hexIn.length === 0, hexIn.join("; "));

const distHex = [];
for (const f of walk(dist).filter((p) => [".html", ".css", ".js", ".svg"].includes(extname(p)))) {
  const m = (read(f).match(HEX) || []).filter((h) => !tokenHex.has(h.toLowerCase()));
  if (m.length) distHex.push(rel(f) + " " + m.slice(0, 3).join(","));
}
gate("S06", "every colour literal in dist/ is a sampled token", distHex.length === 0, distHex.join("; "));
gate("S07", "every token carries pixel provenance", Object.entries(tokens).filter(([k]) => !k.startsWith("_")).every(([, v]) => /snapped to real pixel\)? .* x=\d+ y=\d+/.test(v.provenance)));

const fav = read(join(dist, "favicon.svg"));
gate("S08", "favicon is a 32x32 SVG with traced paths and no double hyphen", /width="32"/.test(fav) && /height="32"/.test(fav) && /viewBox="0 0 32 32"/.test(fav) && /<path[^>]+d="M/.test(fav) && !fav.includes("--") && !fav.includes("<!--"));
gate("S09", "favicon fill is a token", [...fav.matchAll(/fill="(#[0-9a-fA-F]{6})"/g)].every((m) => tokenHex.has(m[1].toLowerCase())) && /fill="#/.test(fav));

const allCode = walk(dist).filter((p) => [".html", ".css", ".js"].includes(extname(p))).map((p) => [rel(p), read(p)]);
const chHits = allCode.filter(([, t]) => /\b\d*\.?\d+\s*ch\b/.test(t)).map(([f]) => f);
gate("S10", "no ch units anywhere", chHits.length === 0, chHits.join(", "));

const reg = JSON.parse(read(join(dist, "register.json")));
const okShape = reg.records.every((r) => ["stated", "absent", "unconfirmed"].includes(r.state));
const inertClean = reg.records.filter((r) => r.state !== "stated").every((r) => !("value" in r) && !("url" in r));
gate("S11", "register: every record has a valid state", okShape);
gate("S12", "register: inert records carry no value and no url", inertClean);
const ids = reg.records.map((r) => r.id);
gate("S13", "register holds chain, market source, contract, X and GitHub", ["chain", "market-source", "ca", "x", "github"].every((i) => ids.includes(i)));
const chain = reg.records.find((r) => r.id === "chain"), rpc = reg.records.find((r) => r.id === "rpc");
gate("S14", "register: Solana chain and publicnode RPC as stated", chain.value === "Solana" && rpc.url === "https://solana-rpc.publicnode.com" && chain.source === "client statement" && chain.scope === "batch-level");

const X_PATH = "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z";
const GH_PATH = "M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z";
const html = read(join(dist, "index.html")), uijs = read(join(dist, "js", "ui.js")), css = read(join(dist, "css", "styles.css"));
gate("S15", "social icons use the official X mark and GitHub Octicon paths", html.includes(X_PATH) && html.includes(GH_PATH) && uijs.includes(X_PATH) && uijs.includes(GH_PATH));
gate("S16", "reduced-motion: media query, blanket stop, own-row animation none", /prefers-reduced-motion: reduce/.test(css) && /animation: none !important/.test(css) && /\.own[^{]*\{[^}]*animation: none/.test(css));
gate("S17", "poll cadence is 60s and backoff is exponential", /every = 60000/.test(read(join(dist, "js", "market.js"))) && /Math\.pow\(2, attempt - 1\)/.test(read(join(dist, "js", "market.js"))));
gate("S18", "motion tokens match the reference measurements", /cubic-bezier\(0\.16, 1, 0\.3, 1\)/.test(css) && /1\.6s var\(--ease-sweep\)/.test(css) && /7s linear infinite/.test(css) && /38/.test(read(join(dist, "js", "motion.js"))) && /ownPulse 2s ease-in-out infinite/.test(css));
gate("S19", "own row: mint 2px left border, ownPulse, brand logo placeholder", /\.own \{ border-left: 2px solid var\(--color-mint\)/.test(css) && /migrate-logo\.png/.test(html) && /pump\.fun|logo-source/.test(read(join(dist, "js", "main.js"))));
gate("S20", "no dd.dexscreener.com logo used by the app code", !allCode.filter(([f]) => f.startsWith("js/")).some(([, t]) => /dd\.dexscreener\.com/.test(t)));

// ---- contrast (WCAG) on real token pairs
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mixHex = (a, b, pa) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * pa + parseInt(b.slice(i, i + 2), 16) * (1 - pa)).toString(16).padStart(2, "0")).join("");
const T = (k) => tokens[k].value;
const pairs = [["ink/paper", T("ink"), T("paper")], ["muted/paper", mixHex(T("ink"), T("paper"), 0.62), T("paper")], ["muted/wash", mixHex(T("ink"), T("paper"), 0.62), T("brandWash")], ["brandDeep/paper", T("brandDeep"), T("paper")], ["paper/brand button", T("paper"), T("brand")], ["paper/ink strip", T("paper"), T("ink")]];
const lowc = pairs.map(([n, a, b]) => [n, ratio(a, b)]).filter(([, r]) => r < 4.5);
gate("S21", "text contrast >= 4.5:1 on all token pairs used", lowc.length === 0, lowc.map(([n, r]) => n + " " + r.toFixed(2)).join(", "));

// ---- copy distance from the reference
const fp = JSON.parse(read(join(root, "scripts", "fixtures", "ref-fingerprint.json")));
const STOP = new Set(fp.stop), RB = new Set(fp.bigrams), RW = new Set(fp.words);
const h10 = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 10);
function copyOf(h) {
  const body = h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ");
  const text = [...body.matchAll(/>([^<]+)</g)].map((m) => m[1]).join(" ") + " " + [...body.matchAll(/(?:aria-label|title|alt)="([^"]+)"|name="description" content="([^"]+)"|og:description" content="([^"]+)"/g)].map((m) => m[1] || m[2] || m[3]).join(" ");
  return text.replace(/&[a-z]+;/g, " ").toLowerCase();
}
const ours = copyOf(html) + " " + (read(join(dist, "js", "ui.js")).match(/"[A-Za-z][A-Za-z ,.']{12,}"/g) || []).filter((x) => !/noopener/.test(x)).join(" ").toLowerCase() + " " + read(join(dist, "js", "main.js")).match(/"[A-Za-z][A-Za-z ,.']{12,}"/g)?.join(" ").toLowerCase();
const ow = ours.match(/[a-z][a-z']+/g) || [];
const shared2 = new Set();
for (let i = 0; i < ow.length - 1; i++) { if (STOP.has(ow[i]) || STOP.has(ow[i + 1])) continue; if (RB.has(h10(ow[i] + " " + ow[i + 1]))) shared2.add(ow[i] + " " + ow[i + 1]); }
gate("S22", "copy: zero shared content 2-grams with the reference", shared2.size === 0, [...shared2].slice(0, 8).join(" | "));
const shared1 = [...new Set(ow.filter((w) => !STOP.has(w) && w.length > 3 && RW.has(h10(w))))];
console.log("         info: generic single words also on the reference (" + shared1.length + "): " + shared1.join(", "));

// ---- no dates in shipped copy (rendered check repeats in the browser)
const DATE_RES = [/\b(19|20)\d{2}\b/, /\b\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}\b/, /\b\d{1,2}:\d{2}(:\d{2})?\b/, /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i, /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i, /\b(ago|as of|updated|checked|yesterday|today|tomorrow|last updated|timestamp)\b/i, /\b\d{4}-\d{2}-\d{2}\b/];
export const findDates = (s) => DATE_RES.map((r) => (s.match(r) || [])[0]).filter(Boolean);
const staticDates = findDates(copyOf(html)).concat(findDates(ours));
gate("S23", "no dates, timestamps or clock strings in shipped copy", staticDates.length === 0, staticDates.join(" "));

// ---- address scanner: match address-shaped strings against stated registry; never reject 0x blindly
const B58 = /[1-9A-HJ-NP-Za-km-z]{32,44}/g, EVM = /0x[0-9a-fA-F]{40}/g;
export function scanAddresses(text, statedValues) {
  const hex = text.match(EVM) || [];
  const found = [...hex, ...(text.replace(EVM, " ").match(B58) || [])];
  return found.filter((a) => !statedValues.includes(a));
}
gate("S24", "scanner: stated 0x passes, unmatched 0x fails, stated base58 passes, unmatched base58 fails",
  scanAddresses("x " + TEST_EVM, [TEST_EVM]).length === 0 && scanAddresses("x " + TEST_EVM, []).length === 1 && scanAddresses(TEST_CA, [TEST_CA]).length === 0 && scanAddresses(TEST_CA, []).length === 1);

// ===================================================================================== browser
const { srv, origin } = await serve();
const browser = await launch();
const NO_ANIM_RE = /none/;

const withRec = (fn) => (j) => { fn(j.records, (id) => j.records.find((r) => r.id === id)); return j; };
const STATED_REG = withRec((rs, g) => {
  Object.assign(g("ca"), { state: "stated", value: TEST_CA });
  Object.assign(g("x"), { state: "stated", url: "https://x.com/migrate_test" });
  Object.assign(g("github"), { state: "stated", url: "https://github.com/migrate-test/site" });
});

async function liveRecord(page, id) { return page.evaluate(async (i) => { const j = await (await fetch("/register.json", { cache: "no-store" })).json(); return j.records.find((r) => r.id === i); }, id); }
const domAudit = (page) => page.evaluate(() => {
  const texts = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const p = w.currentNode.parentElement; if (p && !["SCRIPT", "STYLE"].includes(p.tagName)) texts.push(w.currentNode.nodeValue); }
  const attrs = []; document.querySelectorAll("*").forEach((el) => { for (const a of ["title", "aria-label", "alt", "placeholder", "content", "href", "src", "value", "data-copy"]) { if (el.hasAttribute(a)) attrs.push(a + "=" + el.getAttribute(a)); } });
  document.querySelectorAll("meta").forEach((m) => attrs.push("meta=" + (m.getAttribute("content") || "")));
  return { text: texts.join(" ") + " " + document.title, attrs: attrs.join(" "), html: document.documentElement.outerHTML };
});

async function socialGate(label, page, vw) {
  const issues = [];
  for (const id of ["x", "github"]) {
    const rec = await liveRecord(page, id);                             // read the state at runtime, never hardcode
    const info = await page.evaluate((i) => {
      const el = document.querySelector('[data-social="' + i + '"]'); if (!el) return null;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return { tag: el.tagName, href: el.getAttribute("href"), w: r.width, h: r.height, right: r.right, left: r.left, vis: cs.visibility !== "hidden" && cs.display !== "none" && r.width > 0, text: el.textContent.trim(), svg: !!el.querySelector("svg"), aria: el.getAttribute("aria-label"), disabled: el.getAttribute("aria-disabled"), inert: el.classList.contains("is-inert") };
    }, id);
    if (!info) { issues.push(id + " missing"); continue; }
    if (!info.vis || !info.svg) issues.push(id + " not rendered");
    if (info.w < 44 || info.h < 44) issues.push(id + " tap target " + info.w + "x" + info.h);
    if (info.text) issues.push(id + " has text label");
    if (info.left < vw / 2) issues.push(id + " not top-right");
    if (rec.state === "stated") { if (info.tag !== "A" || !info.href || !info.href.startsWith(rec.url.replace(/\/+$/, ""))) issues.push(id + " stated but no link " + info.href); }
    else if (info.href || info.tag === "A" || !info.inert) issues.push(id + " inert expected, got " + info.tag + " " + info.href);
  }
  gate(label, "social icons: present, icon-only, top-right, 44px, state read at runtime (" + vw + "px)", issues.length === 0, issues.join("; "));
}

try {
  // ------------------------------------------------------------------ BRANCH A: contract address absent
  head("BROWSER, branch A: contract address ABSENT (live register)");
  const mkA = market({ delayBoosts: 900 });
  const A = await openPage(browser, origin, { market: mkA });
  const pa = A.page;
  await sleep(250);
  const skel = await pa.evaluate(() => ({ rows: document.querySelectorAll(".skel-row").length, tk: document.querySelectorAll(".tk-skel").length }));
  gate("A01", "skeleton loaders present before data lands", skel.rows >= 6 && skel.tk >= 3, JSON.stringify(skel));
  await settle(pa, "[data-row]", 9);
  const afterSkel = await pa.evaluate(() => ({ skel: document.querySelectorAll(".skel-row").length, fade: document.querySelectorAll("[data-row].fade-in").length, i: [...document.querySelectorAll("[data-row]")].map((r) => r.style.getPropertyValue("--i")).join(",") }));
  gate("A02", "skeleton replaced by rows that fade in with a stagger", afterSkel.skel === 0 && afterSkel.fade >= 9 && afterSkel.i === "0,1,2,3,4,5,6,7,8", JSON.stringify(afterSkel));

  const ca = await pa.evaluate(() => { const s = document.querySelector("#ca"), v = s.querySelector("[data-ca-value]"), b = s.querySelector("[data-ca-copy]"), r = s.getBoundingClientRect(), top = document.querySelector(".site-head").getBoundingClientRect(); return { state: s.dataset.state, text: v.textContent.trim(), disabled: b.disabled, aria: b.getAttribute("aria-disabled"), fs: parseFloat(getComputedStyle(v).fontSize), top: r.top, label: s.querySelector(".ca-label").textContent.trim(), visible: r.height > 40 }; });
  gate("A03", "CA slot: top of page, large, inert, label + pending only", ca.state === "absent" && ca.text === "pending" && ca.disabled && ca.aria === "true" && ca.fs >= 15 && ca.top <= 1 && ca.visible, JSON.stringify(ca));
  const caRegRec = await liveRecord(pa, "ca");
  gate("A04", "CA record carries no value or url while not stated", caRegRec.state !== "stated" ? !("value" in caRegRec) && !("url" in caRegRec) : true);
  await socialGate("A05", pa, 1440);

  const own = await pa.evaluate(() => {
    const rows = document.querySelector("[data-rows]"); const first = rows.firstElementChild; const o = document.querySelector("[data-own-row]");
    const cs = getComputedStyle(o); const img = o.querySelector("img");
    return { first: first === o, img: img && img.getAttribute("src"), letters: o.querySelectorAll('[data-tile="letter"]').length, clickable: o.querySelectorAll("a").length, btnDisabled: o.querySelector("button").disabled, price: o.querySelector('[data-cell="price"]').textContent.trim(), dots: o.querySelector('[data-cell="change"]').textContent.trim(), anim: cs.animationName, play: cs.animationPlayState, border: cs.borderLeftWidth + " " + cs.borderLeftStyle, borderColor: cs.borderLeftColor, mint: (() => { const p = document.createElement("i"); p.style.color = "var(--color-mint)"; document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; })(), name: o.querySelector(".tok-name b").textContent.trim() };
  });
  gate("A06", "row #1 placeholder: brand logo (not a letter tile), dots, $0.00, non-clickable", own.first && /migrate-logo\.png$/.test(own.img) && own.letters === 0 && own.clickable === 0 && own.btnDisabled && own.price === "$0.00" && own.dots === "· · · · ·", JSON.stringify(own));
  gate("A07", "row #1 keeps ownPulse running and the mint 2px left border", /ownPulse/.test(own.anim) && own.play === "running" && own.border === "2px solid" && own.borderColor === own.mint, own.anim + " " + own.border + " " + own.borderColor + " vs " + own.mint);

  const trend = await pa.evaluate(() => ({ n: document.querySelectorAll("[data-row]").length, ranks: [...document.querySelectorAll("[data-row] .rank")].map((e) => e.textContent).join(","), syms: [...document.querySelectorAll("[data-row] .tok-name small")].map((e) => e.textContent), vols: [...document.querySelectorAll("[data-row]")].map((r) => r.querySelector('[data-cell="volume"]').textContent), copyBtns: document.querySelectorAll("[data-row] button").length, letters: document.querySelectorAll('[data-row] [data-tile="letter"]').length, imgs: document.querySelectorAll('[data-row] [data-tile="image"] img').length }));
  gate("A08", "rows 2-10 are Solana trending: nine rows, ranked 2..10, a copy button on each", trend.n === 9 && trend.ranks === "2,3,4,5,6,7,8,9,10" && trend.copyBtns === 9, JSON.stringify(trend));
  gate("A09", "trending ordered by 24h volume, deepest pair only, base-token side only, Solana only", trend.syms.join(",") === "TKA,TKB,TKC,TKD,TKE,TKF,TKG,TKH,TKI", trend.syms.join(","));
  gate("A10", "logos load from imageUrl; letter tiles under threshold (>=2 fails)", trend.imgs >= 9 && trend.letters < 2, trend.imgs + " images, " + trend.letters + " letters");
  await counted(pa);
  const tiles = await pa.evaluate(() => ({ vol: document.querySelector('[data-tile="volume"]').textContent, n: document.querySelector('[data-tile="count"]').textContent, tk: document.querySelectorAll(".ticker-track .tk[data-tk]").length, tkAnim: getComputedStyle(document.querySelector(".ticker-track")).animationName, pill: document.querySelector("[data-status]").dataset.state, pillText: document.querySelector("[data-status-text]").textContent }));
  gate("A11", "stat tiles and marquee fill from the same live data; status pill is live", /\$/.test(tiles.vol) && tiles.n === "9" && tiles.tk >= 18 && /marquee/.test(tiles.tkAnim) && tiles.pill === "live", JSON.stringify(tiles));
  await counted(pa);
  const priceFmt = await pa.evaluate(() => [...document.querySelectorAll("[data-row] [data-cell=price]")].map((e) => e.textContent).join(" "));
  gate("A12", "prices format: tiny values use subscript zero notation", /\$0\.0[₀-₉]\d{4}/.test(priceFmt) && /\$142\.35/.test(priceFmt), priceFmt);
  const reqsA = mkA.log.filter((l) => l.url.includes("api.dexscreener.com")).map((l) => new URL(l.url).pathname.split("/").slice(0, 3).join("/"));
  gate("A13", "market fetched from token-boosts then tokens/v1/solana; no own-token calls without a CA", reqsA.includes("/token-boosts/top") && reqsA.includes("/tokens/v1") && !mkA.log.some((l) => l.url.includes("/latest/dex/tokens/") || l.url.includes("pump.fun")), reqsA.join());
  const dA = await domAudit(pa);
  gate("A14", "no dates, timestamps or clock strings in rendered text, attributes or tooltips", findDates(dA.text + " " + dA.attrs).length === 0, findDates(dA.text + " " + dA.attrs).join(" "));
  const stray = scanAddresses(dA.text + " " + dA.attrs.replace(/href=\S+|src=\S+/g, ""), []);
  gate("A15", "address scanner: no address-shaped string in the DOM while CA is absent", stray.length === 0, stray.join(","));
  gate("A16", "no console errors or uncaught exceptions", A.errors.length === 0, A.errors.join(" | "));

  // clicking a row's copy button copies that token's address only
  const cp = await pa.evaluate(async () => { document.querySelector("[data-row] button").click(); await new Promise((r) => setTimeout(r, 80)); return window.__copied.slice(); });
  gate("A17", "per-row copy button copies a full address without exposing it in the DOM", cp.length === 1 && cp[0].length === 44);

  // visual layer
  const vis = await pa.evaluate(() => ({ anims: document.getAnimations().length, dotAnim: getComputedStyle(document.querySelector(".dot"), "::after").animationName, mesh: document.querySelectorAll(".mesh .blob").length, layers: document.querySelectorAll("[data-depth]").length }));
  gate("A18", "animated mesh, live-dot pulse and running animations", vis.anims > 5 && /ping/.test(vis.dotAnim) && vis.mesh === 3 && vis.layers >= 5, JSON.stringify(vis));
  await pa.mouse.move(200, 200); await pa.mouse.move(1200, 700, { steps: 8 }); await sleep(450);
  const par = await pa.evaluate(() => document.querySelector(".art-logo").style.getPropertyValue("--px"));
  gate("A19", "hero parallax responds to the pointer", par !== "" && par !== "0.00px" && par !== "0px", par);
  const sc = await pa.evaluate(async () => { const before = document.getElementById("progress").style.transform; scrollTo({ top: 1200, behavior: "instant" }); await new Promise((r) => setTimeout(r, 200)); return { before, after: document.getElementById("progress").style.transform }; });
  gate("A20", "scroll progress bar tracks the page", sc.before !== sc.after && /scaleX\(0\.\d+\)/.test(sc.after), JSON.stringify(sc));
  await pa.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  const card = await pa.evaluate(() => { document.querySelector("#overview").scrollIntoView({ behavior: "instant" }); const c = document.querySelector("#panel-vision .card").getBoundingClientRect(); return { x: c.left + c.width * 0.8, y: c.top + c.height * 0.3 }; });
  await sleep(500);
  const card2 = await pa.evaluate(() => { const c = document.querySelector("#panel-vision .card").getBoundingClientRect(); return { x: c.left + c.width * 0.8, y: c.top + c.height * 0.3 }; });
  await pa.mouse.move(card2.x - 40, card2.y); await pa.mouse.move(card2.x, card2.y, { steps: 3 }); await sleep(250);
  const spot = await pa.evaluate(() => ({ on: document.getElementById("spot")?.className, ry: document.querySelector("#panel-vision .card").style.getPropertyValue("--ry") }));
  gate("A21", "spotlight ring and 3D tilt follow the pointer over cards", spot.on === "on" && spot.ry !== "", JSON.stringify(spot));
  const tabs = await pa.evaluate(async () => { document.querySelector('[data-tab="how"]').click(); await new Promise((r) => setTimeout(r, 120)); return { vis: !document.querySelector("#panel-how").hidden, other: document.querySelector("#panel-vision").hidden, sel: document.querySelector('[data-tab="how"]').getAttribute("aria-selected") }; });
  gate("A22", "tabs switch panels with correct aria state", tabs.vis && tabs.other && tabs.sel === "true");
  const sortOk = await pa.evaluate(async () => { document.querySelector('[data-sort-key="change"]').click(); await new Promise((r) => setTimeout(r, 200)); const ch = [...document.querySelectorAll('[data-row] [data-cell="change"]')].map((e) => parseFloat(e.textContent.replace(/[^0-9.]/g, "") || "0") * (e.classList.contains("down") ? -1 : 1)); return ch.every((v, i) => i === 0 || ch[i - 1] >= v) && document.querySelector('[data-sort-key="change"]').getAttribute("aria-pressed") === "true"; });
  gate("A23", "sort pills reorder the board", sortOk);

  // polling controls: hidden tab rests, visible tab fetches at once
  const count = () => mkA.log.filter((l) => l.url.includes("token-boosts")).length;
  const c0 = count();
  await pa.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await sleep(700); const c1 = count();
  await pa.evaluate(() => { Object.defineProperty(document, "hidden", { value: false, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await sleep(700); const c2 = count();
  gate("A24", "polling pauses while hidden and fetches immediately on visible", c1 === c0 && c2 === c0 + 1, [c0, c1, c2].join("/"));
  await pa.setViewport({ width: 360, height: 800 }); await sleep(300);
  await socialGate("A25", pa, 360);
  await pa.setViewport({ width: 1440, height: 900 });
  await pa.close();

  // ------------------------------------------------------------------ BRANCH B: contract address stated
  head("BROWSER, branch B: contract address STATED (register mutated at the network edge)");
  const mkB = market({ ownCA: TEST_CA, ownInBoosts: true });
  const B = await openPage(browser, origin, { market: mkB, register: STATED_REG });
  const pb = B.page;
  await settle(pb, "[data-row]", 9); await settle(pb, "[data-own-row] [data-cell=price]", 1);
  await pb.waitForFunction(() => document.querySelector("[data-own-row] [data-cell=price]")?.textContent.includes("0.0"), { timeout: 8000 });
  await counted(pb);
  const cb = await pb.evaluate(() => { const s = document.querySelector("#ca"); return { state: s.dataset.state, text: s.querySelector("[data-ca-value]").textContent.trim(), en: !s.querySelector("[data-ca-copy]").disabled, fs: parseFloat(getComputedStyle(s.querySelector("[data-ca-value]")).fontSize) }; });
  gate("B01", "CA slot shows the full stated address, large, with an enabled copy button", cb.state === "stated" && cb.text === TEST_CA && cb.en && cb.fs >= 15, JSON.stringify(cb));
  const copied = await pb.evaluate(async () => { document.querySelector("[data-ca-copy]").click(); await new Promise((r) => setTimeout(r, 120)); return { c: window.__copied.slice(), label: document.querySelector("[data-ca-copy-label]").textContent, done: document.querySelector("[data-ca-copy]").classList.contains("is-done"), live: document.querySelector("[data-ca-live]").textContent }; });
  gate("B02", "click-to-copy writes the address and shows feedback", copied.c[0] === TEST_CA && copied.label === "Copied" && copied.done && copied.live === "Contract address is on the clipboard", JSON.stringify(copied));
  await socialGate("B03", pb, 1440);
  const reqB = mkB.log.map((l) => l.url);
  const dexReq = mkB.log.find((l) => l.url.includes("/latest/dex/tokens/" + TEST_CA)), pumpReq = mkB.log.find((l) => l.url.includes("frontend-api.pump.fun/coins/" + TEST_CA));
  gate("B04", "own token: dex and pump.fun fetched together (Promise.all)", !!dexReq && !!pumpReq && Math.abs(dexReq.t - pumpReq.t) < 250, dexReq && pumpReq ? String(Math.abs(dexReq.t - pumpReq.t)) : "missing");
  const ob = await pb.evaluate(() => {
    const rows = document.querySelector("[data-rows]"), o = document.querySelector("[data-own-row]"), cs = getComputedStyle(o), img = o.querySelector("img");
    const mint = (() => { const p = document.createElement("i"); p.style.color = "var(--color-mint)"; document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; })();
    return { first: rows.firstElementChild === o, name: o.querySelector(".tok-name b").textContent, sym: o.querySelector("small").textContent, link: o.querySelector("a")?.href, logo: img.getAttribute("src"), price: o.querySelector('[data-cell="price"]').textContent, chg: o.querySelector('[data-cell="change"]').textContent, vol: o.querySelector('[data-cell="volume"]').textContent, liq: o.querySelector('[data-cell="liquidity"]').textContent, liqTitle: o.querySelector('[data-cell="liquidity"]').title, kind: o.querySelector('[data-cell="liquidity"]').dataset.kind, border: cs.borderLeftWidth + " " + cs.borderLeftStyle, bc: cs.borderLeftColor, mint, anim: cs.animationName, ownCount: [...document.querySelectorAll("[data-row] small")].filter((e) => e.textContent === "MIG").length, trendN: document.querySelectorAll("[data-row]").length, ranks: [...document.querySelectorAll("[data-row] .rank")].map((e) => e.textContent).join(",") };
  });
  gate("B05", "row #1 pinned above trending, price/change/volume from the best base-token pair", ob.first && ob.sym === "MIG" && /^\$0\.000456/.test(ob.price) && ob.vol === "$777K" && /12\.34%/.test(ob.chg), JSON.stringify(ob));
  gate("B06", "logo comes from pump.fun image_uri, never the dd.dexscreener.com cdn", ob.logo === "https://img.test/own.png" && !reqB.some((u) => u.includes("dd.dexscreener.com")), ob.logo);
  gate("B07", "liquidity column uses pair liquidity when above zero", ob.kind === "Liquidity" && ob.liq === "$88.0K" && ob.liqTitle === "Liquidity", ob.liq + " " + ob.kind);
  gate("B08", "row #1 mint left border 2px and ownPulse animation", ob.border === "2px solid" && ob.bc === ob.mint && /ownPulse/.test(ob.anim), ob.border + " " + ob.bc + " " + ob.mint + " " + ob.anim);
  gate("B09", "dedup: own token removed from trending rows 2-10", ob.ownCount === 0 && ob.trendN === 9 && ob.ranks === "2,3,4,5,6,7,8,9,10", JSON.stringify({ n: ob.ownCount, t: ob.trendN, r: ob.ranks }));
  gate("B10", "console diagnostics emitted for the own token", B.logs.some((l) => l.includes("[migrate] own token raw response")) && B.logs.some((l) => l.includes("[migrate] own liquidity candidates")));
  const mkpart = await pb.evaluate(() => [...document.querySelectorAll("[data-row] .tok-name small")].map((e) => e.textContent).join(","));
  gate("B11", "market follows only the market-source record: same trending set in both branches", mkpart === trend.syms.join(","), mkpart);
  const dB = await domAudit(pb);
  const strayB = scanAddresses(dB.text + " " + dB.attrs.replace(/href=\S+|src=\S+/g, ""), [TEST_CA]);
  gate("B12", "address scanner: only the stated address appears (CA exempt, nothing else address-shaped)", strayB.length === 0, strayB.join(","));
  gate("B13", "no dates anywhere in the stated branch", findDates(dB.text + " " + dB.attrs).length === 0, findDates(dB.text + " " + dB.attrs).join(" "));
  const tkB = await pb.evaluate(() => document.querySelector(".ticker-track .tk b")?.textContent);
  gate("B14", "ticker leads with the own token once stated", tkB === "MIG", tkB);
  gate("B15", "no console errors in the stated branch", B.errors.length === 0, B.errors.join(" | "));
  await pb.close();

  // B-variants: no liquidity -> market cap; pump.fun down -> local logo; broken pump image -> local logo
  const V1 = await openPage(browser, origin, { market: market({ ownCA: TEST_CA, ownNoLiquidity: true }), register: STATED_REG });
  await V1.page.waitForFunction(() => document.querySelector("[data-own-row] [data-cell=liquidity]")?.dataset.kind, { timeout: 9000 }); await counted(V1.page);
  const v1 = await V1.page.evaluate(() => { const l = document.querySelector("[data-own-row] [data-cell=liquidity]"); return { kind: l.dataset.kind, title: l.title, text: l.textContent }; });
  gate("B16", "no liquidity: falls back to market cap, labelled Mkt Cap via title", v1.kind === "Mkt Cap" && v1.title === "Mkt Cap" && v1.text === "$1.25M", JSON.stringify(v1));
  await V1.page.close();
  const V2 = await openPage(browser, origin, { market: market({ ownCA: TEST_CA, pumpStatus: 500 }), register: STATED_REG });
  await V2.page.waitForFunction(() => document.querySelector("[data-own-row] [data-cell=price]")?.textContent.includes("0.0"), { timeout: 9000 });
  const v2 = await V2.page.evaluate(() => document.querySelector("[data-own-row] img").getAttribute("src"));
  gate("B17", "pump.fun failure: logo falls back to assets/logo-192.png, numbers still render", /logo-192\.png$/.test(v2), v2);
  await V2.page.close();
  const V3 = await openPage(browser, origin, { market: market({ ownCA: TEST_CA, ownImg: "https://img.test/broken-own.png" }), register: STATED_REG });
  await V3.page.waitForFunction(() => document.querySelector("[data-own-row] [data-cell=price]")?.textContent.includes("0.0"), { timeout: 9000 }); await sleep(900);
  const v3 = await V3.page.evaluate(() => ({ src: document.querySelector("[data-own-row] img").getAttribute("src"), letters: document.querySelectorAll("[data-own-row] [data-tile=letter]").length }));
  gate("B18", "broken pump.fun image: falls back to assets/logo-192.png, never a letter tile", /logo-192\.png$/.test(v3.src) && v3.letters === 0, JSON.stringify(v3));
  await V3.page.close();

  // ------------------------------------------------------------------ images, fallbacks, failure
  head("BROWSER, tiles, failure handling");
  const L = await openPage(browser, origin, { market: market({ noImages: [0, 3], brokenImages: [5] }) });
  await settle(L.page, "[data-row]", 9); await sleep(1100);
  const lt = await L.page.evaluate(() => ({ letters: document.querySelectorAll('[data-row] [data-tile="letter"]').length, firstLetter: document.querySelector('[data-row] [data-tile="letter"]')?.textContent }));
  gate("C01", "letter tile fallback for missing and failing imageUrl (3 here, so a >=2 threshold trips)", lt.letters === 3 && /^[A-Z0-9]$/.test(lt.firstLetter), JSON.stringify(lt));
  await L.page.close();

  const F = await openPage(browser, origin, { market: market({ boostsStatus: 500 }) });
  const t0 = Date.now(); await sleep(7600);
  const att = F.mk.log.filter((l) => l.url.includes("token-boosts")).map((l) => l.t - t0);
  const fs = await F.page.evaluate(() => ({ err: !document.querySelector("[data-board-error]").hidden, dashes: document.querySelectorAll("[data-dash] .cell-dash").length, pill: document.querySelector("[data-status]").dataset.state, vol: document.querySelector('[data-tile="volume"]').textContent, own: document.querySelector("[data-own-row]").classList.contains("is-placeholder") }));
  gate("C02", "source down: dashes plus an error notice, delayed status, placeholder row intact", fs.err && fs.dashes >= 9 * 4 && fs.pill === "delayed" && fs.vol === "—" && fs.own, JSON.stringify(fs));
  const g1 = att[1] - att[0], g2 = att[2] - att[1];
  gate("C03", "exponential backoff between retries (about 2s then 4s)", att.length >= 3 && g1 > 1500 && g1 < 3200 && g2 > 3300 && g2 < 5600 && g2 > g1 * 1.5, att.join(",") + " gaps " + g1 + "/" + g2);
  await F.page.close();

  const K = await openPage(browser, origin, { market: market() });
  await settle(K.page, "[data-row]", 9);
  K.mk.opts.boostsStatus = 500;
  const before = await K.page.evaluate(() => [...document.querySelectorAll("[data-row] .tok-name small")].map((e) => e.textContent).join(","));
  await K.page.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); Object.defineProperty(document, "hidden", { value: false, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await sleep(900);
  const kept = await K.page.evaluate(() => ({ syms: [...document.querySelectorAll("[data-row] .tok-name small")].map((e) => e.textContent).join(","), pill: document.querySelector("[data-status]").dataset.state, err: document.querySelector("[data-board-error]").hidden }));
  gate("C04", "refresh failure keeps the last good rows and flags the pill", kept.syms === before && kept.pill === "delayed" && kept.err, JSON.stringify(kept));
  K.mk.opts.boostsStatus = 200; K.mk.opts.volumeBump = 5_000_000;
  await K.page.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); Object.defineProperty(document, "hidden", { value: false, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await sleep(1000);
  const flashed = await K.page.evaluate(() => ({ pill: document.querySelector("[data-status]").dataset.state, vol: document.querySelector('[data-row] [data-cell="volume"]').textContent, cls: [...document.querySelectorAll('[data-row] [data-cell="volume"]')].some((e) => /flash/.test(e.className)) }));
  gate("C05", "recovery restores live status and flashes changed values", flashed.pill === "live" && flashed.cls, JSON.stringify(flashed));
  await K.page.close();

  // ------------------------------------------------------------------ mutation harness (state-independent anchors)
  head("MUTATION HARNESS (anchors read the live record, expectations derived from it)");
  async function mutated(mut, mk) { const M = await openPage(browser, origin, { market: mk || market({ ownCA: TEST_CA }), register: withRec(mut) }); await sleep(900); return M; }
  for (const id of ["x", "github"]) {
    const M0 = await openPage(browser, origin, { market: market() });
    const cur = await liveRecord(M0.page, id); await M0.page.close();
    const flipTo = cur.state === "stated" ? "absent" : "stated";
    const url = id === "x" ? "https://x.com/mutant_handle" : "https://github.com/mutant-org/repo";
    const M = await mutated((rs, g) => { const r = g(id); r.state = flipTo; if (flipTo === "stated") r.url = url; else { r.url = url; r.value = "https://evil.example"; } });
    const s = await M.page.evaluate((i) => { const e = document.querySelector('[data-social="' + i + '"]'); return { tag: e.tagName, href: e.getAttribute("href"), aria: e.getAttribute("aria-label") }; }, id);
    const want = flipTo === "stated" ? s.tag === "A" && s.href === url && s.aria.endsWith(id === "x" ? "@mutant_handle" : "mutant-org") : s.tag === "SPAN" && !s.href;
    gate("M-" + id, id + " flipped " + cur.state + " -> " + flipTo + (flipTo === "absent" ? " with leftover value and url" : "") + ": icon follows (handle derived, leftovers ignored)", want, JSON.stringify(s));
    await M.page.close();
  }
  const M1 = await mutated((rs, g) => { g("x").state = "stated"; g("x").url = "https://evil.example/mutant"; });
  const m1 = await M1.page.evaluate(() => document.querySelector('[data-social="x"]').tagName); gate("M-host", "stated X url on a foreign host is refused and stays inert", m1 === "SPAN"); await M1.page.close();
  const M2 = await mutated((rs, g) => { Object.assign(g("ca"), { state: "stated", value: "not-an-address" }); });
  const m2 = await M2.page.evaluate(() => ({ st: document.querySelector("#ca").dataset.state, dis: document.querySelector("[data-ca-copy]").disabled })); gate("M-ca-bad", "stated CA that is not address-shaped is refused", m2.st !== "stated" && m2.dis, JSON.stringify(m2)); await M2.page.close();
  const M3 = await mutated((rs, g) => { Object.assign(g("ca"), { state: "stated", value: TEST_EVM }); });
  const m3 = await M3.page.evaluate(() => ({ st: document.querySelector("#ca").dataset.state, v: document.querySelector("[data-ca-value]").textContent })); gate("M-ca-0x", "a stated 0x hex address is accepted, not blanket-rejected", m3.st === "stated" && m3.v === TEST_EVM, JSON.stringify(m3)); await M3.page.close();
  const M4 = await mutated((rs, g) => { Object.assign(g("ca"), { state: "stated", value: "0x1234" }); });
  const m4 = await M4.page.evaluate(() => document.querySelector("#ca").dataset.state); gate("M-ca-short", "0x with the wrong length is refused", m4 !== "stated"); await M4.page.close();
  const M5 = await mutated((rs, g) => { Object.assign(g("ca"), { state: "unconfirmed", value: TEST_CA, url: "https://x.com/z" }); });
  const m5 = await domAudit(M5.page); gate("M-unconfirmed", "unconfirmed CA never leaks its value into the page", !m5.html.includes(TEST_CA)); await M5.page.close();
  const M6 = await mutated((rs, g) => { g("market-source").state = "absent"; delete g("market-source").url; });
  const m6 = await M6.page.evaluate(() => ({ dash: document.querySelectorAll("[data-dash]").length, err: !document.querySelector("[data-board-error]").hidden })); gate("M-market", "market follows the market-source record: absent source means no market, whatever the CA says", m6.dash === 9 && m6.err && !M6.mk.log.some((l) => l.url.includes("dexscreener")), JSON.stringify(m6)); await M6.page.close();
  const M7 = await openPage(browser, origin, { market: market({ ownCA: TEST_CA }), register: STATED_REG });
  await sleep(800);
  await M7.page.evaluate((a) => { const p = document.createElement("p"); p.textContent = "injected " + a; document.body.appendChild(p); }, fakeAddr(1234));
  const d7 = await domAudit(M7.page); const s7 = scanAddresses(d7.text, [TEST_CA]);
  gate("M-scanner", "scanner catches an injected look-alike address while exempting the stated CA", s7.length === 1 && s7[0] === fakeAddr(1234), s7.join(",")); await M7.page.close();

  // ------------------------------------------------------------------ reduced motion
  head("REDUCED MOTION");
  for (const [tag, reg] of [["absent", undefined], ["stated", STATED_REG]]) {
    const R = await openPage(browser, origin, { reduced: true, market: market({ ownCA: TEST_CA }), register: reg });
    await settle(R.page, "[data-row]", 9); await sleep(1400);
    const rm = await R.page.evaluate(() => { const o = document.querySelector("[data-own-row]"); return { anims: document.getAnimations().filter((a) => a.playState === "running" && a.effect && a.effect.getTiming().duration > 1).length, own: getComputedStyle(o).animationName, prog: getComputedStyle(document.getElementById("progress")).display, spot: !!document.getElementById("spot"), tk: getComputedStyle(document.querySelector(".ticker-track")).animationName, blob: getComputedStyle(document.querySelector(".blob")).animationName, hidden: [...document.querySelectorAll("[data-reveal]")].filter((e) => getComputedStyle(e).opacity !== "1").length, vol: document.querySelector('[data-tile="volume"]').textContent }; });
    gate("R-" + tag, "prefers-reduced-motion (" + tag + "): zero running animations, no overlays, content instantly visible", rm.anims === 0 && rm.own === "none" && rm.prog === "none" && !rm.spot && rm.tk === "none" && rm.blob === "none" && rm.hidden === 0 && /\$/.test(rm.vol), JSON.stringify(rm));
    await R.page.close();
  }

  // ------------------------------------------------------------------ asset bytes
  head("ASSETS");
  const AS = await openPage(browser, origin, { market: market() });
  const png = await AS.page.evaluate(async () => {
    const out = {};
    for (const n of ["logo-96", "logo-192", "migrate-logo"]) {
      const img = new Image(); img.src = "/assets/" + n + ".png"; await img.decode();
      const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data; let edge = 0, dark = 0, opaque = 0, clear = 0;
      for (let i = 0; i < d.length; i += 4) { const a = d[i + 3]; if (a === 0) clear++; else if (a === 255) opaque++; else if (a > 8) { edge++; if (d[i] + d[i + 1] + d[i + 2] < 150 && a > 40) dark++; } }
      out[n] = { w: img.naturalWidth, edge, dark, opaque, clear };
    }
    return out;
  });
  const fringe = Object.entries(png).filter(([, v]) => v.dark > v.edge * 0.02 || v.clear === 0);
  gate("D01", "logo rasters keep alpha and have no dark fringe (premultiplied resize)", fringe.length === 0 && png["logo-192"].w === 192, JSON.stringify(png));
  await AS.page.close();
  const ihdr = readFileSync(join(dist, "assets", "logo-192.png")); gate("D02", "logo-192.png IHDR is RGBA colour type 6", ihdr[25] === 6 && ihdr.readUInt32BE(16) === 192);
} catch (e) {
  gate("X00", "gate run completed without a harness error", false, String(e && e.stack || e));
} finally {
  await browser.close(); srv.close();
}

const fails = results.filter((r) => !r.pass);
console.log("\n" + "=".repeat(60));
console.log("gates: " + results.length + " run, " + (results.length - fails.length) + " passed, " + fails.length + " failed");
fails.forEach((f) => console.log("  FAIL " + f.id + " " + f.desc + (f.detail ? "\n       " + f.detail : "")));
process.exit(fails.length ? 1 : 0);
