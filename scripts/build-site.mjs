// build-site.mjs
// Node port of publish.ps1's build steps. Rebuilds the REPORTS and DISCOVERY
// arrays inside index.html from digests/*.md and discovery/*.md and writes the
// finished site to dist/. The committed index.html is only a template; dist/ is
// what GitHub Pages serves. Idempotent: safe to run any number of times.
//
// Usage: node scripts/build-site.mjs

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const digestsDir = path.join(root, "digests");
const discoveryDir = path.join(root, "discovery");
const templatePath = path.join(root, "index.html");
const distDir = path.join(root, "dist");

function fail(msg) {
  console.error("ERROR: " + msg);
  process.exit(1);
}

// Pull a one-line highlight out of a digest's Summary section (same rules as
// Get-Highlight in publish.ps1).
function getHighlight(raw) {
  let para = "";
  let m = raw.match(/^##\s+Summary\s*\r?\n+(.+?)(\r?\n\r?\n|\r?\n##|\r?\n---)/ms);
  if (m) para = m[1].replace(/\r?\n/g, " ").trim();
  if (!para) {
    m = raw.match(/^1\.\s+\*\*([^*\r\n]+)\*\*/m);
    if (m) para = m[1].trim();
  }
  if (!para) {
    m = raw.match(/^##\s+(?!Summary\s*$).{5,80}/m);
    if (m) para = m[0].replace(/^##\s+/, "");
  }
  if (!para) return "";
  const sentences = para.split(/(?<=[.!?])\s+/);
  let out = "";
  for (const s of sentences) {
    out = out ? (out + " " + s).trim() : s;
    if (out.length >= 90) break;
  }
  if (out.length > 220) {
    let cut = out.substring(0, 217);
    const lastSpace = cut.lastIndexOf(" ");
    if (lastSpace > 0) cut = cut.substring(0, lastSpace);
    out = cut + "...";
  }
  return out.replaceAll("**", "");
}

function friendlyDate(dateStr) {
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const escapeMd = (s) => s.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${");
const escapeStr = (s) => s.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

// Build the JS array body for one folder of dated markdown files, newest first.
function buildEntries(dir, { dropPersonalName }) {
  if (!fs.existsSync(dir)) return { body: "\n", count: 0 };
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse();
  let body = "\n";
  let count = 0;
  for (const f of files) {
    const m = path.basename(f, ".md").match(/^(\d{4}-\d{2}-\d{2})/);
    if (!m) continue;
    let raw = fs.readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "");
    if (dropPersonalName) raw = raw.replaceAll("Applause (Dana Prey)", "Applause");
    body +=
      "{\n" +
      `  date: "${m[1]}",\n` +
      `  label: "${friendlyDate(m[1])}",\n` +
      `  highlight: "${escapeStr(getHighlight(raw))}",\n` +
      "  md: `" + escapeMd(raw) + "`\n" +
      "},\n";
    count++;
  }
  return { body, count };
}

// Replace everything between `startMarker` and the next "\n];" with `body`.
function splice(html, startMarker, body, required) {
  const start = html.indexOf(startMarker);
  if (start < 0) {
    if (required) fail(`Could not find "${startMarker}" in index.html.`);
    console.warn(`WARN: "${startMarker}" not found; skipping.`);
    return html;
  }
  const arrayStart = start + startMarker.length;
  const end = html.indexOf("\n];", arrayStart);
  if (end < 0) fail(`Could not find the end of the array after "${startMarker}".`);
  return html.substring(0, arrayStart) + body + html.substring(end);
}

if (!fs.existsSync(templatePath)) fail("index.html template not found.");
if (!fs.existsSync(digestsDir)) fail("digests/ folder not found.");

let html = fs.readFileSync(templatePath, "utf8").replace(/^﻿/, "");

const reports = buildEntries(digestsDir, { dropPersonalName: true });
if (reports.count === 0) fail("No dated digest files found in digests/.");
html = splice(html, "const REPORTS = [", reports.body, true);

const discovery = buildEntries(discoveryDir, { dropPersonalName: false });
html = splice(html, "const DISCOVERY = [", discovery.body, false);

// Syntax-check the page's inline script so a bad digest fails the build instead
// of publishing a broken page.
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (scripts.length === 0) fail("No inline <script> found in index.html.");
scripts.forEach((code, i) => {
  try {
    new vm.Script(code);
  } catch (e) {
    fail(`Inline script ${i + 1} has a syntax error: ${e.message}`);
  }
});

// Assemble dist/.
fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(path.join(distDir, "index.html"), html, "utf8");
for (const extra of ["favicon.ico", "robots.txt"]) {
  const p = path.join(root, extra);
  if (fs.existsSync(p)) fs.copyFileSync(p, path.join(distDir, extra));
}
const tools = path.join(root, "ci-tools");
if (fs.existsSync(tools)) fs.cpSync(tools, path.join(distDir, "ci-tools"), { recursive: true });

console.log(`Built dist/index.html: ${reports.count} reports, ${discovery.count} discovery scans.`);
