// Motion layer. Everything routes through calm(): when the visitor prefers reduced motion nothing animates.
const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
export const calm = () => mq.matches;
const fine = window.matchMedia("(hover: hover) and (pointer: fine)");

// ---- damped spring solver (semi-implicit Euler, fixed 1/240s sub-steps). Settles near the reference's 680ms expo-out.
export function spring(onFrame, { from = 0, to = 1, stiffness = 190, damping = 26, mass = 1, delay = 0, done } = {}) {
  if (calm()) { onFrame(to); done && done(); return () => {}; }
  let x = from, v = 0, last = 0, raf = 0, dead = false;
  const step = 1 / 240;
  const tick = (t) => {
    if (dead) return;
    if (!last) last = t;
    let dt = Math.min((t - last) / 1000, 0.05); last = t;
    while (dt > 0) {
      const h = Math.min(step, dt);
      const a = (-stiffness * (x - to) - damping * v) / mass;
      v += a * h; x += v * h; dt -= h;
    }
    onFrame(x);
    if (Math.abs(x - to) < 0.002 && Math.abs(v) < 0.01) { onFrame(to); done && done(); return; }
    raf = requestAnimationFrame(tick);
  };
  const start = () => { raf = requestAnimationFrame(tick); };
  const to_ = delay > 0 ? setTimeout(start, delay) : (start(), 0);
  return () => { dead = true; cancelAnimationFrame(raf); clearTimeout(to_); };
}

// ---- scroll reveal: spring from 16px/6px blur, cascade 38ms capped at 18 steps
export function initReveal() {
  const els = [...document.querySelectorAll("[data-reveal]")];
  if (calm() || !("IntersectionObserver" in window)) return;
  els.forEach((el) => { el.style.opacity = "0"; });
  let batch = 0, timer = 0;
  const io = new IntersectionObserver((entries) => {
    const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
    vis.forEach((e, k) => {
      const el = e.target; io.unobserve(el);
      spring((p) => {
        const c = Math.min(Math.max(p, 0), 1);
        el.style.opacity = String(c);
        el.style.translate = "0 " + ((1 - p) * 16).toFixed(2) + "px";
        el.style.filter = c >= 0.999 ? "" : "blur(" + ((1 - c) * 6).toFixed(2) + "px)";
      }, { delay: Math.min(k, 18) * 38, done: () => { el.style.opacity = ""; el.style.translate = ""; el.style.filter = ""; } });
    });
  }, { threshold: 0.08, rootMargin: "0px 0px -4% 0px" });
  els.forEach((el) => io.observe(el));
  // never leave content hidden if observers are throttled
  setTimeout(() => els.forEach((el) => { if (el.style.opacity === "0") el.style.opacity = ""; }), 4000);
}

// ---- progress bar
export function initProgress() {
  const bar = document.getElementById("progress");
  if (!bar) return;
  if (calm()) { bar.style.display = "none"; return; }
  let raf = 0;
  const upd = () => { raf = 0; const h = document.documentElement; const max = h.scrollHeight - h.clientHeight; bar.style.transform = "scaleX(" + (max > 0 ? Math.min(1, h.scrollTop / max) : 0).toFixed(4) + ")"; };
  addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(upd); }, { passive: true });
  addEventListener("resize", upd, { passive: true }); upd();
}

// ---- hero parallax: pointer + scroll, eased toward target
export function initParallax() {
  const root = document.querySelector("[data-parallax-root]");
  if (!root || calm()) return;
  const layers = [...root.querySelectorAll("[data-depth]")];
  let tx = 0, ty = 0, cx = 0, cy = 0, sy = 0, raf = 0;
  const loop = () => {
    cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
    layers.forEach((l) => { const d = +l.dataset.depth; l.style.setProperty("--px", (cx * d * 18).toFixed(2) + "px"); l.style.setProperty("--py", (cy * d * 18 - sy * d * 0.06).toFixed(2) + "px"); });
    raf = (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) ? requestAnimationFrame(loop) : 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
  addEventListener("pointermove", (e) => { if (e.pointerType !== "mouse") return; tx = (e.clientX / innerWidth - 0.5) * 2; ty = (e.clientY / innerHeight - 0.5) * 2; kick(); }, { passive: true });
  addEventListener("scroll", () => { sy = Math.min(scrollY, 900); kick(); }, { passive: true });
}

// ---- spotlight ring + 3D tilt for cards
export function initSpotlight() {
  if (calm() || !fine.matches) return;
  const spot = document.createElement("div"); spot.id = "spot"; document.body.appendChild(spot);
  let on = null, tilted = null;
  const untilt = () => { if (tilted) { tilted.style.removeProperty("--rx"); tilted.style.removeProperty("--ry"); tilted = null; } };
  const off = () => { spot.className = ""; spot.style.width = spot.style.height = "0px"; on = null; untilt(); };
  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const t = e.target.closest && e.target.closest(".spot, .card, .phase, .row:not(.row-head):not(.skel-row)");
    if (!t) { if (on) off(); return; }
    const r = t.getBoundingClientRect();
    if (on !== t) { untilt(); on = t; spot.style.borderRadius = getComputedStyle(t).borderRadius; }
    const x = e.clientX - r.left, y = e.clientY - r.top;
    Object.assign(spot.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    spot.style.setProperty("--x", x + "px"); spot.style.setProperty("--y", y + "px"); spot.className = "on";
    if (t.classList.contains("card") || t.classList.contains("phase")) {
      tilted = t;
      t.style.setProperty("--rx", ((0.5 - y / r.height) * 7).toFixed(2) + "deg");
      t.style.setProperty("--ry", ((x / r.width - 0.5) * 9).toFixed(2) + "deg");
    }
  }, { passive: true });
  document.addEventListener("pointerleave", off);
  addEventListener("scroll", () => { if (on) off(); }, { passive: true });
}

// ---- nav pill that glides between desktop menu items
export function initNavPill() {
  const nav = document.querySelector("[data-nav]");
  if (!nav || calm() || !fine.matches) return;
  const pill = document.createElement("div"); pill.id = "navpill"; document.body.appendChild(pill);
  nav.addEventListener("pointerover", (e) => {
    const a = e.target.closest("a"); if (!a) return;
    const r = a.getBoundingClientRect();
    pill.style.width = r.width + "px"; pill.style.height = r.height + "px";
    pill.style.transform = "translate(" + r.left + "px," + r.top + "px)"; pill.classList.add("on");
  });
  nav.addEventListener("pointerleave", () => pill.classList.remove("on"));
}

// ---- numbers: count up on first fill, flash on later change
export function setNumber(el, value, fmt) {
  const prev = el._v;
  el._v = value;
  const text = fmt(value);
  if (!Number.isFinite(value)) { el.textContent = text; el.classList.add("cell-dash"); return; }
  el.classList.remove("cell-dash");
  if (prev === undefined || !Number.isFinite(prev)) {
    if (calm() || value === 0) { el.textContent = text; return; }
    if (el._stop) el._stop();
    el.dataset.counting = "1";
    el._stop = spring((p) => { el.textContent = fmt(value * Math.min(Math.max(p, 0), 1.0)); }, { stiffness: 170, damping: 26, done: () => { el.textContent = fmt(value); delete el.dataset.counting; el._stop = null; } });
    return;
  }
  if (el._stop) { el._stop(); el._stop = null; delete el.dataset.counting; }
  el.textContent = text;
  if (prev !== value && !calm()) {
    const cls = value > prev ? "flash-up" : "flash-down";
    el.classList.remove("flash-up", "flash-down"); void el.offsetWidth; el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 1150);
  }
}
