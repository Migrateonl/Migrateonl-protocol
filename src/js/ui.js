import { fmtPrice, fmtCompact, fmtPct, shortAddr, DASH } from "./format.js";
import { setNumber } from "./motion.js";

const $ = (s, r = document) => r.querySelector(s);
const SVG_ATTR = 'viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const ICON_COPY = "<svg " + SVG_ATTR + ' stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></svg>';
const ICON_OK = "<svg " + SVG_ATTR + ' stroke-width="2.4"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICON = {
  x: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg>',
  github: '<svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>'
};
const LABEL = { x: "X", github: "GitHub" };

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok;
  } catch (e) { return false; }
}

function flashDone(btn, labelEl, idle, done) {
  clearTimeout(btn._t);
  btn.classList.add("is-done");
  if (labelEl) labelEl.textContent = done; else btn.innerHTML = ICON_OK;
  btn._t = setTimeout(() => {
    btn.classList.remove("is-done");
    if (labelEl) labelEl.textContent = idle; else btn.innerHTML = ICON_COPY;
  }, 1600);
}

// ---------- register-driven slots ----------
export function renderCA(rec) {
  const strip = $("#ca"), val = $("[data-ca-value]"), btn = $("[data-ca-copy]"), lab = $("[data-ca-copy-label]"), live = $("[data-ca-live]");
  const stated = rec.state === "stated" && !!rec.value;
  const st = stated ? "stated" : rec.state;
  strip.dataset.state = st;
  val.textContent = stated ? rec.value : "pending";
  btn.disabled = !stated; btn.setAttribute("aria-disabled", String(!stated));
  btn.setAttribute("aria-label", stated ? "Copy contract address" : "Copy contract address, pending");
  btn.onclick = null;
  if (stated) {
    btn.onclick = async () => {
      const ok = await copyText(rec.value);
      flashDone(btn, lab, "Copy", ok ? "Copied" : "Select and copy");
      live.textContent = ok ? "Contract address is on the clipboard" : "Copy failed";
      setTimeout(() => { live.textContent = ""; }, 1800);
    };
  }
  const tile = $('[data-tile="ca"]');
  if (tile) { tile.textContent = stated ? shortAddr(rec.value) : "pending"; tile.closest("[data-record]").dataset.state = st; }
  const chip = $('[data-chip="ca"]');
  if (chip) {
    chip.dataset.state = st; chip.classList.toggle("is-inert", !stated); chip.textContent = "";
    const s = document.createElement("span"); s.textContent = "Contract address"; chip.appendChild(s);
    const v = document.createElement(stated ? "code" : "b"); v.textContent = stated ? shortAddr(rec.value) : "pending"; chip.appendChild(v);
  }
}

export function renderSocial(id, rec) {
  const old = $('[data-social="' + id + '"]');
  const stated = rec.state === "stated" && !!rec.url;
  let el;
  if (stated) {
    el = document.createElement("a"); el.className = "social tap"; el.href = rec.url; el.target = "_blank"; el.rel = "noopener noreferrer";
    el.setAttribute("aria-label", LABEL[id] + " " + rec.handle);
  } else {
    el = document.createElement("span"); el.className = "social is-inert"; el.setAttribute("role", "img"); el.setAttribute("aria-label", LABEL[id] + ", pending");
  }
  el.dataset.social = id; el.dataset.state = stated ? "stated" : rec.state; el.innerHTML = ICON[id];
  old.replaceWith(el);
  const chip = $('[data-chip="' + id + '"]');
  if (chip) {
    chip.dataset.state = stated ? "stated" : rec.state; chip.classList.toggle("is-inert", !stated); chip.textContent = "";
    const s = document.createElement("span"); s.textContent = LABEL[id]; chip.appendChild(s);
    if (stated) { const a = document.createElement("a"); a.href = rec.url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = rec.handle; chip.appendChild(a); }
    else { const b = document.createElement("b"); b.textContent = "pending"; chip.appendChild(b); }
  }
}

// ---------- status pill ----------
export function setStatus(state, text) {
  const p = $("[data-status]"); p.dataset.state = state; $("[data-status-text]").textContent = text;
}

// ---------- tiles ----------
const fmtInt = (n) => (Number.isFinite(n) ? String(Math.round(n)) : DASH);
export function renderTiles(rows) {
  const real = rows.filter(Boolean);
  const total = real.reduce((s, r) => s + (Number.isFinite(r.volume) ? r.volume : 0), 0);
  setNumber($('[data-tile="volume"]'), real.length ? total : NaN, fmtCompact);
  setNumber($('[data-tile="count"]'), real.length ? real.length : NaN, fmtInt);
}

// ---------- logo tiles: image, then fallback image, then letter tile ----------
let letterIx = 0;
function letterTile(host, sym) {
  host.className = "logo-tile letter t" + (letterIx++ % 3); host.dataset.tile = "letter";
  host.textContent = (String(sym).match(/[A-Za-z0-9]/) || ["?"])[0].toUpperCase();
}
export function makeTile(row, fallbackSrc) {
  const host = document.createElement("span"); host.className = "logo-tile";
  const src = row.image && /^https:\/\//.test(row.image) ? row.image : "";
  if (!src && !fallbackSrc) { letterTile(host, row.symbol); return host; }
  const img = document.createElement("img");
  img.width = 40; img.height = 40; img.alt = ""; img.decoding = "async"; img.referrerPolicy = "no-referrer";
  host.dataset.tile = src ? "image" : "fallback";
  img.onerror = () => {
    if (fallbackSrc && img.getAttribute("src") !== fallbackSrc) { host.dataset.tile = "fallback"; img.src = fallbackSrc; return; }
    host.textContent = ""; letterTile(host, row.symbol);
  };
  img.src = src || fallbackSrc;
  host.appendChild(img);
  return host;
}

// ---------- rows ----------
function cell(name, cls) {
  const s = document.createElement("span");
  s.setAttribute("role", "cell"); s.className = "num mono " + (cls || "") + " cell-dash"; s.dataset.cell = name; s.textContent = DASH;
  return s;
}
function safePairUrl(u) {
  try { const x = new URL(u); return x.protocol === "https:" && /(^|\.)dexscreener\.com$/.test(x.hostname) ? x.href : ""; } catch (e) { return ""; }
}

export function buildRow(row, rank, opts) {
  const own = !!(opts && opts.own), i = (opts && opts.i) || 0;
  const el = document.createElement("div");
  el.className = "row fade-in" + (own ? " own" : ""); el.setAttribute("role", "row"); el.style.setProperty("--i", String(i));
  if (own) { el.setAttribute("data-own-row", ""); el.dataset.state = "stated"; } else el.setAttribute("data-row", "");
  const rk = document.createElement("span"); rk.className = "rank mono"; rk.setAttribute("role", "cell"); rk.textContent = String(rank);
  const tok = document.createElement("span"); tok.className = "tok"; tok.setAttribute("role", "cell");
  tok.appendChild(makeTile(row, own ? "/assets/logo-192.png" : ""));
  const nm = document.createElement("span"); nm.className = "tok-name";
  const b = document.createElement("b"); const url = safePairUrl(row.url);
  if (url) { const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = row.name; b.appendChild(a); } else b.textContent = row.name;
  const sm = document.createElement("small"); sm.textContent = row.symbol; nm.append(b, sm); tok.appendChild(nm);
  const cp = document.createElement("span"); cp.className = "num"; cp.setAttribute("role", "cell");
  const btn = document.createElement("button"); btn.type = "button"; btn.className = "icon-btn tap"; btn.innerHTML = ICON_COPY;
  btn.setAttribute("aria-label", "Copy address of " + row.symbol);
  const address = row.address;                    // held in a closure, never written to the DOM
  btn.addEventListener("click", async () => { const ok = await copyText(address); if (ok) flashDone(btn, null); });
  cp.appendChild(btn);
  el.append(rk, tok, cell("price", "price"), cell("change", "chg"), cell("volume"), cell("liquidity"), cp);
  fillRow(el, row, own);
  return el;
}

export function fillRow(el, row, own) {
  const q = (n) => el.querySelector('[data-cell="' + n + '"]');
  setNumber(q("price"), row.price, fmtPrice);
  const c = q("change"); setNumber(c, row.change, fmtPct);
  c.classList.toggle("up", row.change > 0); c.classList.toggle("down", row.change < 0);
  setNumber(q("volume"), row.volume, fmtCompact);
  const liq = q("liquidity");
  setNumber(liq, own ? row.depth : row.liquidity, fmtCompact);
  if (own) { liq.title = row.depthLabel; liq.dataset.kind = row.depthLabel; }
}

export function dashRow(rank, own) {
  const el = document.createElement("div"); el.className = "row fade-in" + (own ? " own" : ""); el.setAttribute("role", "row"); el.setAttribute(own ? "data-own-row" : "data-dash", ""); el.style.setProperty("--i", String(rank));
  if (own) el.dataset.state = "stated";
  const rk = document.createElement("span"); rk.className = "rank mono"; rk.setAttribute("role", "cell"); rk.textContent = String(rank);
  const tok = document.createElement("span"); tok.className = "tok"; tok.setAttribute("role", "cell");
  const lt = document.createElement("span"); lt.className = "logo-tile";
  if (own) { const im = document.createElement("img"); im.src = "/assets/logo-192.png"; im.width = 40; im.height = 40; im.alt = ""; lt.appendChild(im); lt.dataset.tile = "fallback"; }
  const nm = document.createElement("span"); nm.className = "tok-name"; nm.innerHTML = "<b></b><small></small>";
  nm.firstChild.textContent = own ? "MIGRATE" : DASH; nm.lastChild.textContent = own ? "waiting on source" : DASH;
  tok.append(lt, nm);
  const cp = document.createElement("span"); cp.className = "num"; cp.setAttribute("role", "cell");
  el.append(rk, tok, cell("price", "price"), cell("change", "chg"), cell("volume"), cell("liquidity"), cp);
  return el;
}

// ---------- ticker ----------
export function renderTicker(items) {
  const track = $("[data-ticker-track]");
  if (!items.length) return;
  const sig = items.map((r) => r.address).join(",");
  const paint = (n, r) => {
    n.querySelector(".px").textContent = fmtPrice(r.price);
    const c = n.querySelector(".chg"); c.textContent = fmtPct(r.change); c.className = "chg mono " + (r.change > 0 ? "up" : r.change < 0 ? "down" : "");
  };
  if (track._sig === sig) {
    track.querySelectorAll("[data-tk]").forEach((n) => { const r = items[+n.dataset.tk]; if (r) paint(n, r); });
    return;
  }
  track._sig = sig; track.textContent = "";
  for (let k = 0; k < 2; k++) {
    items.forEach((r, ix) => {
      const s = document.createElement("span"); s.className = "tk"; s.dataset.tk = String(ix); if (k) s.setAttribute("aria-hidden", "true");
      const lg = makeTile(r, r.own ? "/assets/logo-192.png" : ""); lg.classList.add("tk-logo");
      const sy = document.createElement("b"); sy.textContent = r.symbol;
      const px = document.createElement("span"); px.className = "px mono";
      const ch = document.createElement("span"); ch.className = "chg mono";
      s.append(lg, sy, px, ch); paint(s, r); track.appendChild(s);
    });
  }
  track.style.setProperty("--dur", Math.max(30, items.length * 7) + "s");
}
