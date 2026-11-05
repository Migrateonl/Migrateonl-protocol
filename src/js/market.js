// Market data. Endpoints derive from the market-source register record only; contract-address state never touches trending.
import { num } from "./format.js";

const TIMEOUT = 10000;

async function getJSON(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
    return await res.json();
  } finally { clearTimeout(t); }
}

function pairToRow(p) {
  return {
    address: p.baseToken.address,
    symbol: p.baseToken.symbol || "?",
    name: p.baseToken.name || p.baseToken.symbol || "Token",
    price: num(p.priceUsd),
    change: num(p.priceChange && p.priceChange.h24),
    volume: num(p.volume && p.volume.h24),
    liquidity: num(p.liquidity && p.liquidity.usd),
    marketCap: num(p.marketCap),
    image: (p.info && p.info.imageUrl) || "",
    url: p.url || ""
  };
}

function bestPairs(pairs, wanted) {
  const best = new Map();
  for (const p of pairs || []) {
    if (!p || !p.baseToken || (p.chainId && p.chainId !== "solana")) continue;
    const a = p.baseToken.address;
    if (wanted && !wanted.has(a)) continue;
    const v = num(p.volume && p.volume.h24);
    const cur = best.get(a);
    if (!cur || (Number.isFinite(v) ? v : -1) > (num(cur.volume && cur.volume.h24) || -1)) best.set(a, p);
  }
  return best;
}

// Boosted tokens -> Solana only -> pairs -> top ten by 24h volume.
export async function fetchTrending(base) {
  const boosts = await getJSON(base + "/token-boosts/top/v1");
  const list = Array.isArray(boosts) ? boosts : [];
  const addrs = [...new Set(list.filter((b) => b && b.chainId === "solana" && b.tokenAddress).map((b) => b.tokenAddress))];
  if (!addrs.length) throw new Error("no solana entries");
  const chunks = [];
  for (let i = 0; i < addrs.length; i += 30) chunks.push(addrs.slice(i, i + 30));
  const results = await Promise.all(chunks.map((c) => getJSON(base + "/tokens/v1/solana/" + c.join(","))));
  const best = bestPairs(results.flat(), new Set(addrs));
  const rows = [...best.values()].map(pairToRow).sort((a, b) => (Number.isFinite(b.volume) ? b.volume : -1) - (Number.isFinite(a.volume) ? a.volume : -1)).slice(0, 10);
  if (!rows.length) throw new Error("no pairs");
  return rows;
}

// Own token: dex pairs and pump.fun logo fetched in parallel. pump.fun failing never blocks the numbers.
export async function fetchOwn(base, logoBase, ca) {
  const [dex, pump] = await Promise.all([
    getJSON(base + "/latest/dex/tokens/" + encodeURIComponent(ca)),
    getJSON(logoBase + "/" + encodeURIComponent(ca)).catch((e) => { console.warn("[migrate] logo source failed", e.message); return null; })
  ]);
  console.log("[migrate] own token raw response", { dex, pump });
  const pair = [...bestPairs(dex && dex.pairs, new Set([ca])).values()][0];
  if (!pair) throw new Error("no pair for contract address");
  const row = pairToRow(pair);
  const liq = Number.isFinite(row.liquidity) && row.liquidity > 0 ? row.liquidity : NaN;
  const mc = Number.isFinite(row.marketCap) && row.marketCap > 0 ? row.marketCap : NaN;
  console.log("[migrate] own liquidity candidates", { liquidityUsd: row.liquidity, marketCap: row.marketCap, chosen: Number.isFinite(liq) ? "liquidity" : Number.isFinite(mc) ? "marketCap" : "none" });
  row.depth = Number.isFinite(liq) ? liq : mc;
  row.depthLabel = Number.isFinite(liq) ? "Liquidity" : "Mkt Cap";
  row.image = (pump && typeof pump.image_uri === "string" && pump.image_uri) || "";      // never the dd.dexscreener.com logo
  row.address = ca;
  return row;
}

// Polling controller: 60s cadence, exponential backoff on failure, rests while hidden, immediate on visible.
export function createPoller(task, { onOk, onFail, onStart, every = 60000, backoffBase = 2000, backoffCap = 30000, retries = 3 }) {
  let timer = null, attempt = 0, running = false, stopped = false, epoch = 0;
  const clear = () => { clearTimeout(timer); timer = null; };
  const schedule = (ms) => { clear(); if (!stopped && !document.hidden) timer = setTimeout(cycle, ms); };
  async function cycle() {
    if (running || stopped || document.hidden) return;
    running = true; const my = ++epoch; clear(); onStart && onStart(attempt);
    try {
      const data = await task();
      if (my !== epoch) return;
      attempt = 0;
      try { onOk(data); } catch (e) { console.error("[migrate] render failed", e); }
      schedule(every);
    } catch (err) {
      if (my !== epoch) return;
      attempt += 1; onFail(err, attempt);
      schedule(attempt <= retries ? Math.min(backoffBase * Math.pow(2, attempt - 1), backoffCap) : every);
      if (attempt > retries) attempt = 0;
    } finally { if (my === epoch) running = false; }
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) { clear(); epoch++; running = false; } else { attempt = 0; cycle(); } });
  return { start: cycle, stop() { stopped = true; clear(); } };
}
