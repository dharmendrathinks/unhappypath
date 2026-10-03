import { readFile, mkdir, copyFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { exportRun } from "../dist/export.js";
const source = resolve(process.argv[2]);
const destination = resolve(process.argv[3]);
const entries = JSON.parse(
  await readFile(join(source, "summary.json"), "utf8"),
);
await mkdir(destination, { recursive: false });
for (const entry of entries) {
  if (!/^[a-z0-9-]+$/.test(entry.id)) throw new Error("Invalid run id");
  await exportRun(join(source, entry.id), join(destination, entry.id));
}
for (const name of ["index.html", "summary.json"])
  await copyFile(join(source, name), join(destination, name));
console.log(
  `Exported ${entries.length} reviewed-format reference runs to ${destination}`,
);
