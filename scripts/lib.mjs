// Shared harness: static server for dist/, headless Edge/Chrome, deterministic market mocks.
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const dist = join(root, "dist");

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".txt": "text/plain" };

export function serve(port = 0) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const f = join(dist, p);
      if (!f.startsWith(dist) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end("nf"); return; }
      res.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream", "cache-control": "no-store" });
      res.end(readFileSync(f));
    });
    srv.listen(port, "127.0.0.1", () => resolve({ srv, origin: "http://127.0.0.1:" + srv.address().port }));
  });
}

export function findBrowser() {
  const c = [process.env.BROWSER_PATH, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].filter(Boolean);
  const f = c.find((p) => existsSync(p));
  if (!f) throw new Error("no Edge or Chrome found; set BROWSER_PATH");
  return f;
}
export const launch = () => puppeteer.launch({ executablePath: findBrowser(), headless: true, args: ["--no-sandbox", "--disable-gpu", "--force-device-scale-factor=1"] });

// ---------- deterministic fixtures ----------
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function fakeAddr(seed) {
  let x = (seed * 2654435761) >>> 0, s = "";
  for (let i = 0; i < 44; i++) { x = (x * 1664525 + 1013904223) >>> 0; s += B58[(x >>> 8) % 58]; }
  return s;
}
export const TEST_CA = fakeAddr(99);
export const TEST_EVM = "0x" + "ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12";
const SOL = Array.from({ length: 12 }, (_, i) => fakeAddr(i + 1));
const ETH = [fakeAddr(200), fakeAddr(201)];

const PRICES = ["142.35", "0.8123", "0.00001234", "0.045", "3.2", "0.00000456", "0.9", "12.5", "0.0003", "0.21", "7.77", "0.0000089"];
function pair(addr, i, over) {
  return Object.assign({
    chainId: "solana", url: "https://dexscreener.com/solana/p" + i,
    baseToken: { address: addr, name: "Token " + String.fromCharCode(65 + i), symbol: "TK" + String.fromCharCode(65 + i) },
    quoteToken: { address: fakeAddr(500), symbol: "SOL", name: "Wrapped SOL" },
    priceUsd: PRICES[i], priceChange: { h24: i % 3 === 0 ? -(i + 1.5) : i * 3.1 + 0.4 },
    volume: { h24: (13 - i) * 1_000_000 + i * 321 }, liquidity: { usd: (13 - i) * 90_000 }, marketCap: (13 - i) * 2_000_000,
    info: { imageUrl: "https://img.test/t" + i + ".png" }
  }, over || {});
}

export function market(opts = {}) {
  const o = Object.assign({ ownCA: null, boostsStatus: 200, ownInBoosts: false, ownNoLiquidity: false, pumpStatus: 200, ownImg: "https://img.test/own.png", brokenImages: [], noImages: [], delayBoosts: 0, volumeBump: 0 }, opts);
  const log = [];
  const handler = async (url) => {
    const u = new URL(url); const t = Date.now(); log.push({ url, t });
    const json = (body, status = 200) => ({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
    if (u.host === "api.dexscreener.com" && u.pathname === "/token-boosts/top/v1") {
      if (o.delayBoosts) await new Promise((r) => setTimeout(r, o.delayBoosts));
      if (o.boostsStatus !== 200) return json({ error: "x" }, o.boostsStatus);
      const list = SOL.map((a) => ({ chainId: "solana", tokenAddress: a, amount: 10 })).concat(ETH.map((a) => ({ chainId: "ethereum", tokenAddress: a })), [{ chainId: "solana", tokenAddress: SOL[0] }]);
      if (o.ownInBoosts && o.ownCA) list.push({ chainId: "solana", tokenAddress: o.ownCA });
      return json(list);
    }
    if (u.host === "api.dexscreener.com" && u.pathname.startsWith("/tokens/v1/solana/")) {
      const want = u.pathname.split("/").pop().split(",");
      const out = [];
      want.forEach((a) => {
        const i = SOL.indexOf(a);
        if (i >= 0) {
          const over = {};
          if (o.noImages.includes(i)) over.info = {};
          if (o.brokenImages.includes(i)) over.info = { imageUrl: "https://img.test/broken" + i + ".png" };
          const p = pair(a, i, over); p.volume.h24 += o.volumeBump; out.push(p);
          out.push(pair(a, i, { url: "https://dexscreener.com/solana/small" + i, volume: { h24: 10 }, priceUsd: "999" }));       // smaller pair must lose
          out.push(Object.assign(pair(fakeAddr(600 + i), i), { quoteToken: { address: a, symbol: "X", name: "X" }, volume: { h24: 9e12 } })); // token is the quote side: must be ignored
        } else if (a === o.ownCA) {
          out.push(ownPair(o.ownCA, o, { volume: { h24: 2e7 } }));
        }
      });
      return json(out);
    }
    if (u.host === "api.dexscreener.com" && u.pathname.startsWith("/latest/dex/tokens/")) {
      const a = u.pathname.split("/").pop();
      return json({ schemaVersion: "1.0.0", pairs: [ownPair(a, o, { volume: { h24: 11 } , url: "https://dexscreener.com/solana/ownsmall", priceUsd: "5" }), ownPair(a, o), Object.assign(ownPair(fakeAddr(700), o), { quoteToken: { address: a, symbol: "Q", name: "Q" }, volume: { h24: 9e12 } })] });
    }
    if (u.host === "frontend-api.pump.fun") {
      if (o.pumpStatus !== 200) return json({ error: "x" }, o.pumpStatus);
      return json({ image_uri: o.ownImg, symbol: "MIG" });
    }
    return null;
  };
  return { handler, log, opts: o };
}
function ownPair(a, o, over) {
  const p = {
    chainId: "solana", url: "https://dexscreener.com/solana/ownpair",
    baseToken: { address: a, name: "Migrate", symbol: "MIG" }, quoteToken: { address: fakeAddr(500), symbol: "SOL", name: "Wrapped SOL" },
    priceUsd: "0.000456", priceChange: { h24: 12.34 }, volume: { h24: 777_000 }, liquidity: o.ownNoLiquidity ? undefined : { usd: 88_000 }, marketCap: 1_250_000, info: { imageUrl: "https://dd.dexscreener.com/ds-data/tokens/solana/" + a + ".png" }
  };
  return Object.assign(p, over || {});
}

const PNG = () => readFileSync(join(dist, "assets", "logo-96.png"));

// open a page with interception wired. cfg: {width,height,reduced,register(json)=>json,market}
export async function openPage(browser, origin, cfg = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: cfg.width || 1440, height: cfg.height || 900, deviceScaleFactor: 1 });
  if (cfg.reduced) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.evaluateOnNewDocument(() => {
    window.__copied = [];
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t) => { window.__copied.push(t); } }, configurable: true });
  });
  const logs = []; const errors = [];
  page.on("console", (m) => logs.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  const mk = cfg.market || market();
  await page.setRequestInterception(true);
  page.on("request", async (req) => {
    try {
      const url = req.url();
      if (url.startsWith(origin)) {
        if (new URL(url).pathname === "/register.json" && cfg.register) {
          const j = JSON.parse(readFileSync(join(dist, "register.json"), "utf8"));
          const out = cfg.register(j) || j;
          return req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(out) });
        }
        return req.continue();
      }
      if (url.startsWith("https://img.test/")) {
        mk.log.push({ url, t: Date.now() });
        if (/broken/.test(url)) return req.respond({ status: 404, body: "" });
        return req.respond({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: PNG() });
      }
      const r = await mk.handler(url);
      if (r) return req.respond(r);
      if (url.startsWith("data:") || url.startsWith("blob:")) return req.continue();
      return req.abort("blockedbyclient");
    } catch (e) { try { req.abort(); } catch (x) { /* closed */ } }
  });
  await page.goto(origin + "/", { waitUntil: "load" });
  return { page, logs, errors, mk };
}

export const settle = (page, sel, n, ms = 9000) => page.waitForFunction((s, k) => document.querySelectorAll(s).length >= k, { timeout: ms }, sel, n);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const counted = (page, ms = 6000) => page.waitForFunction(() => document.querySelectorAll("[data-counting]").length === 0, { timeout: ms });
