// Register pattern: every outside fact is one record with state stated | absent | unconfirmed.
// Only a stated record may expose a value or url. Everything else is stripped on read, so it renders inert.

const STATES = new Set(["stated", "absent", "unconfirmed"]);
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM = /^0x[0-9a-fA-F]{40}$/;
const HOSTS = { x: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"], github: ["github.com", "www.github.com"] };

export function isAddressShaped(s) { return B58.test(s) || EVM.test(s); }

function httpsUrl(raw) {
  try { const u = new URL(raw); return u.protocol === "https:" ? u : null; } catch { return null; }
}

// Returns a sanitised view of one raw record. Never trust the file: re-check shape here.
function sanitise(raw) {
  const id = String(raw && raw.id || "");
  const label = String(raw && raw.label || id);
  let state = STATES.has(raw && raw.state) ? raw.state : "absent";
  const view = { id, label, state };
  if (state !== "stated") return view;

  if (id === "ca") {
    const v = String(raw.value || "").trim();
    if (!isAddressShaped(v)) { view.state = "unconfirmed"; return view; }
    view.value = v; return view;
  }
  if (id === "x" || id === "github") {
    const u = httpsUrl(raw.url);
    const seg = u ? u.pathname.split("/").filter(Boolean)[0] : "";
    if (!u || !HOSTS[id].includes(u.hostname) || !seg) { view.state = "unconfirmed"; return view; }
    view.url = u.origin + u.pathname.replace(/\/+$/, "");
    view.handle = id === "x" ? "@" + seg : seg;           // link rule: store url, derive handle
    return view;
  }
  if (raw.value != null) view.value = String(raw.value);
  if (raw.url != null) {
    const u = httpsUrl(raw.url);
    if (!u) { view.state = "unconfirmed"; delete view.value; return view; }
    view.url = u.origin + u.pathname.replace(/\/+$/, "");
  }
  return view;
}

export async function loadRegister() {
  const map = new Map();
  try {
    const res = await fetch("/register.json", { cache: "no-store" });
    if (!res.ok) throw new Error("register " + res.status);
    const json = await res.json();
    for (const r of json.records || []) { const v = sanitise(r); if (v.id) map.set(v.id, v); }
  } catch (e) {
    console.warn("[migrate] register unavailable, every record inert", e);
  }
  const get = (id) => map.get(id) || { id, label: id, state: "absent" };
  return { get, all: () => [...map.values()] };
}
