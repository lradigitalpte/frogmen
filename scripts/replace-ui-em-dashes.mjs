import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const uiRoot = resolve(process.cwd(), "apps/web/src");
const uiExtensions = new Set([".ts", ".tsx"]);
const emDash = "\u2014";

async function replaceInDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  let changedFiles = 0;

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      changedFiles += await replaceInDirectory(path);
      continue;
    }
    if (!uiExtensions.has(extname(entry.name))) continue;

    const source = await readFile(path, "utf8");
    const updated = source.replaceAll(emDash, " ");
    if (updated !== source) {
      await writeFile(path, updated, "utf8");
      changedFiles += 1;
    }
  }

  return changedFiles;
}

const changedFiles = await replaceInDirectory(uiRoot);
console.log(`Replaced UI em dashes in ${changedFiles} file(s).`);
