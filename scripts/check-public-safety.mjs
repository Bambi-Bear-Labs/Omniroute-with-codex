import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignore = new Set([".git", "node_modules", "coverage", "dist"]);
const failures = [];
const secret = /(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{25,}|sk-[A-Za-z0-9]{25,})/;
const personalPath = new RegExp("[A-Za-z]:/Users/(?!Public/|<)[A-Za-z0-9_. -]+/");
function walk(folder) {
  for (const entry of fs.readdirSync(folder, {withFileTypes:true})) {
    if (ignore.has(entry.name)) continue;
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    const rel = path.relative(root, file);
    const ext = path.extname(entry.name).toLowerCase();
    if ([".sqlite", ".db", ".log"].includes(ext) ||
        ["auth.json", ".env", "runtime.json", "bridge-state.json"].includes(entry.name)) {
      failures.push(`${rel}: local state must not be published`);
    }
    const text = fs.readFileSync(file, "utf8");
    if (secret.test(text)) failures.push(`${rel}: possible credential`);
    if (personalPath.test(text.replaceAll(String.fromCharCode(92), "/"))) {
      failures.push(`${rel}: hard-coded personal Windows path`);
    }
  }
}
walk(root);
if (failures.length) {
  console.error(failures.join(String.fromCharCode(10)));
  process.exitCode = 1;
} else {
  console.log("Public-safety checks passed: no detected credential patterns or personal runtime state.");
}
