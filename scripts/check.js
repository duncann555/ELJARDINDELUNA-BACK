import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const rootsToCheck = ["index.js", "src", "scripts", "test"];
const ignoredDirectories = new Set(["node_modules", ".git"]);

const collectJavaScriptFiles = (target, files = []) => {
  const absolute = resolve(root, target);
  const stats = statSync(absolute);

  if (stats.isFile()) {
    if (absolute.endsWith(".js")) files.push(absolute);
    return files;
  }

  for (const entry of readdirSync(absolute)) {
    if (ignoredDirectories.has(entry)) continue;
    collectJavaScriptFiles(join(target, entry), files);
  }
  return files;
};

const files = rootsToCheck.flatMap((target) =>
  collectJavaScriptFiles(target),
);
let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    failed = true;
    console.error(`[check] ${relative(root, file)}`);
    console.error(result.stderr.trim());
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.info(`[check] ${files.length} archivos JavaScript válidos`);
}
