// Builds dist/ from src/ and public/. dist/ is the only thing that gets deployed.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src"), dist = join(root, "dist");
const tokens = JSON.parse(readFileSync(join(src, "tokens.json"), "utf8"));

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "css"), { recursive: true });
mkdirSync(join(dist, "fonts"), { recursive: true });

// ---- tokens.css: the single place colour literals are emitted
const kebab = (k) => k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
const entries = Object.entries(tokens).filter(([k]) => !k.startsWith("_"));
let css = "/* Generated from src/tokens.json. Every value is a real pixel sampled from the brand art (k-means, snapped to pixel coordinates).\n";
for (const [k, v] of entries) css += "   " + kebab(k) + ": " + v.provenance + "\n";
css += "*/\n:root {\n";
for (const [k, v] of entries) css += "  --color-" + kebab(k) + ": " + v.value + ";\n";
css += "}\n";
writeFileSync(join(dist, "css", "tokens.css"), css);

const sub = (text) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => { if (!tokens[k]) throw new Error("unknown token " + k); return tokens[k].value; });

// ---- html, css, js, register
writeFileSync(join(dist, "index.html"), sub(readFileSync(join(src, "index.html"), "utf8")));
cpSync(join(src, "css", "styles.css"), join(dist, "css", "styles.css"));
cpSync(join(src, "js"), join(dist, "js"), { recursive: true });
cpSync(join(src, "register.json"), join(dist, "register.json"));

// ---- favicon: traced path from the logo pixel grid, fill from tokens
const fav = sub(readFileSync(join(src, "favicon.template.svg"), "utf8"));
if (fav.includes("--")) throw new Error("favicon contains a double hyphen");
writeFileSync(join(dist, "favicon.svg"), fav);

// ---- public assets + self-hosted fonts
cpSync(join(root, "public", "assets"), join(dist, "assets"), { recursive: true });
const fonts = [
  ["@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2", "hanken-grotesk.woff2"],
  ["@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2", "geist-mono.woff2"],
  ["@fontsource/sora/files/sora-latin-700-normal.woff2", "sora-700.woff2"]
];
for (const [from, to] of fonts) {
  const p = join(root, "node_modules", from);
  if (!existsSync(p)) throw new Error("missing font " + from + " (run npm install)");
  cpSync(p, join(dist, "fonts", to));
}

// ---- Cloudflare Pages extras
writeFileSync(join(dist, "_headers"), [
  "/*",
  "  X-Content-Type-Options: nosniff",
  "  Referrer-Policy: strict-origin-when-cross-origin",
  "  Permissions-Policy: camera=(), microphone=(), geolocation=()",
  "  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://api.dexscreener.com https://frontend-api.pump.fun; base-uri 'self'; form-action 'none'; frame-ancestors 'none'",
  "/register.json",
  "  Cache-Control: no-cache",
  "/fonts/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "/assets/*",
  "  Cache-Control: public, max-age=86400",
  ""
].join("\n"));
writeFileSync(join(dist, "robots.txt"), "User-agent: *\nAllow: /\n");

let count = 0, bytes = 0;
(function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); const s = statSync(p); if (s.isDirectory()) walk(p); else { count++; bytes += s.size; } } })(dist);
console.log("build ok: " + count + " files, " + (bytes / 1024).toFixed(0) + " KiB -> dist/");
