const SUB = ["\u2080","\u2081","\u2082","\u2083","\u2084","\u2085","\u2086","\u2087","\u2088","\u2089"];
export const DASH = "\u2014";

export function fmtPrice(n) {
  if (!Number.isFinite(n)) return DASH;
  if (n === 0) return "$0.00";
  if (n >= 1000) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return "$" + n.toFixed(2);
  if (n >= 0.01) return "$" + n.toFixed(4);
  const zeros = Math.floor(-Math.log10(n)) - 0;            // leading zeros after the decimal point
  const lead = zeros;                                        // n = 0.000ddd -> zeros = 3
  if (lead < 4) return "$" + n.toFixed(lead + 4);
  const digits = Math.round(n * Math.pow(10, lead + 4)).toString().padStart(4, "0").slice(0, 4);
  const sub = String(lead).split("").map((d) => SUB[+d]).join("");
  return "$0.0" + sub + digits;
}

export function fmtCompact(n) {
  if (!Number.isFinite(n)) return DASH;
  const a = Math.abs(n);
  const units = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [v, s] of units) if (a >= v) return "$" + (n / v).toFixed(a / v >= 100 ? 0 : a / v >= 10 ? 1 : 2) + s;
  return "$" + n.toFixed(0);
}

export function fmtPct(n) {
  if (!Number.isFinite(n)) return DASH;
  const a = Math.abs(n);
  return (a >= 1000 ? a.toLocaleString("en-US", { maximumFractionDigits: 0 }) : a.toFixed(2)) + "%";
}

export function shortAddr(a) { return a && a.length > 12 ? a.slice(0, 4) + "\u2026" + a.slice(-4) : a || ""; }
export function num(v) { const n = typeof v === "string" ? parseFloat(v) : v; return Number.isFinite(n) ? n : NaN; }
