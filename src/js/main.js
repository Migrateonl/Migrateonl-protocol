import { loadRegister } from "./register.js";
import { fetchTrending, fetchOwn, createPoller } from "./market.js";
import { renderCA, renderSocial, setStatus, renderTiles, buildRow, fillRow, dashRow, renderTicker } from "./ui.js";
import { initReveal, initProgress, initParallax, initSpotlight, initNavPill, calm } from "./motion.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

async function boot() {
  const reg = await loadRegister();
  const ca = reg.get("ca");
  const caStated = ca.state === "stated" && !!ca.value;
  renderCA(ca);
  renderSocial("x", reg.get("x"));
  renderSocial("github", reg.get("github"));

  initProgress(); initParallax(); initSpotlight(); initNavPill(); initReveal();
  initTabs(); initSort();

  // ----- state -----
  let trending = null;     // last good trending rows
  let own = null;          // last good own row
  let sortKey = "volume";
  const rowEls = new Map();
  const box = $("[data-trending]");
  const errBox = $("[data-board-error]");

  if (caStated) { const cur = $("[data-own-row]"); cur.replaceWith(dashRow(1, true)); }

  const keyOf = { volume: (r) => r.volume, change: (r) => r.change, liquidity: (r) => r.liquidity };
  const sorted = (rows) => rows.slice().sort((a, b) => {
    const f = keyOf[sortKey]; const av = Number.isFinite(f(a)) ? f(a) : -Infinity, bv = Number.isFinite(f(b)) ? f(b) : -Infinity;
    return bv - av;
  });

  function renderOwn() {
    if (!caStated || !own) return;
    const cur = $("[data-own-row]");
    if (cur._built) { fillRow(cur, own, true); return; }
    const el = buildRow(own, 1, { own: true }); el._built = true;
    cur.replaceWith(el);
  }

  function renderTrending() {
    if (!trending) return;
    const list = sorted(trending.filter((r) => !(caStated && r.address === ca.value))).slice(0, 9);   // dedup: own token never repeats below
    box.querySelectorAll(".skel-row, [data-dash]").forEach((n) => n.remove());
    const keep = new Set(list.map((r) => r.address));
    for (const [a, el] of rowEls) if (!keep.has(a)) { el.remove(); rowEls.delete(a); }
    list.forEach((r, ix) => {
      let el = rowEls.get(r.address);
      if (el) { fillRow(el, r, false); el.querySelector(".rank").textContent = String(ix + 2); }
      else { el = buildRow(r, ix + 2, { i: ix }); rowEls.set(r.address, el); }
      if (box.children[ix] !== el) box.insertBefore(el, box.children[ix] || null);
    });
  }

  function renderAll() {
    renderOwn(); renderTrending();
    const live = [...(trending ? trending : [])];
    const shown = [];
    if (caStated && own) shown.push(own);
    shown.push(...(trending || []).filter((r) => !(caStated && r.address === ca.value)).slice(0, 9));
    renderTiles(shown);
    const tick = [];
    if (caStated && own) tick.push({ ...own, own: true });
    tick.push(...(live.filter((r) => !(caStated && r.address === ca.value)).slice(0, 10)));
    renderTicker(tick);
  }

  // ----- market source comes from the register, nothing else -----
  const ms = reg.get("market-source");
  const base = ms.state === "stated" && ms.url ? ms.url : "";
  if (!base) { showOffline("Source unavailable"); } else {
    createPoller(() => fetchTrending(base), {
      onStart: () => { if (!trending) setStatus("syncing", "Syncing"); },
      onOk: (rows) => { trending = rows; errBox.hidden = true; setStatus("live", "Live"); renderAll(); },
      onFail: (err) => {
        console.warn("[migrate] market source failed", err && err.message);
        if (!trending) showOffline("Source offline, retrying"); else setStatus("delayed", "Delayed, retrying");
      }
    }).start();
  }

  function showOffline(text) {
    setStatus("delayed", text); errBox.hidden = false;
    renderTiles([]);
    if (box.querySelector("[data-dash]")) return;
    box.textContent = ""; rowEls.clear();
    for (let r = 2; r <= 10; r++) box.appendChild(dashRow(r, false));
  }

  if (caStated) {
    const lg = reg.get("logo-source");
    const logoBase = lg.state === "stated" && lg.url ? lg.url : "";
    createPoller(() => fetchOwn(base, logoBase, ca.value), {
      onOk: (row) => { own = row; renderAll(); },
      onFail: (err) => { console.warn("[migrate] own token failed", err && err.message); }
    }).start();
  }

  // sort buttons re-render from last good data
  document.addEventListener("migrate:sort", (e) => { sortKey = e.detail; renderTrending(); });
}

function initSort() {
  const group = $("[data-sort]");
  group.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-sort-key]"); if (!b) return;
    $$("button", group).forEach((x) => { const on = x === b; x.classList.toggle("is-on", on); x.setAttribute("aria-pressed", String(on)); });
    document.dispatchEvent(new CustomEvent("migrate:sort", { detail: b.dataset.sortKey }));
  });
}

function initTabs() {
  const list = $("[data-tabs]"); const tabs = $$("[data-tab]", list);
  const select = (tab, focus) => {
    tabs.forEach((t) => { const on = t === tab; t.classList.toggle("is-on", on); t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; });
    $$("[data-panel]").forEach((p) => {
      const on = p.dataset.panel === tab.dataset.tab; p.hidden = !on;
      if (on && !calm()) $$(".card", p).forEach((c, i) => { c.classList.remove("fade-in"); void c.offsetWidth; c.style.setProperty("--i", String(i)); c.classList.add("fade-in"); });
    });
    if (focus) tab.focus();
  };
  tabs.forEach((t) => t.addEventListener("click", () => select(t)));
  list.addEventListener("keydown", (e) => {
    const i = tabs.indexOf(document.activeElement); if (i < 0) return;
    const to = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
    if (to !== undefined) { e.preventDefault(); select(tabs[to], true); }
  });
}

boot();
