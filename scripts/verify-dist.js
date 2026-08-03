import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "..", "dist");
const indexHtml = path.join(distPath, "index.html");

if (!existsSync(indexHtml)) {
  console.error("[verify-dist] no dist/index.html");
  process.exit(1);
}

const html = readFileSync(indexHtml, "utf8");
const refs = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
let ok = true;

for (const ref of refs) {
  const file = path.join(distPath, ref.replace(/^\//, ""));
  if (!existsSync(file)) {
    console.error(`[verify-dist] missing ${ref}`);
    ok = false;
  }
}

if (!ok) process.exit(1);
