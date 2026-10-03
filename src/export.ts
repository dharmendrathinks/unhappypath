import {
  mkdir,
  readFile,
  writeFile,
  realpath,
  lstat,
  copyFile,
} from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { verifyRun } from "./runner.js";
// Deliberately exclude xctestrun plans, raw XCTest logs, xcresult bundles and client state.
const allowed = new Set([
  "run.json",
  "report.html",
  "report.md",
  "fixture.json",
  "driver.json",
  "recording.mp4",
  "screen.png",
]);
export async function exportRun(
  source: string,
  destination: string,
): Promise<void> {
  const root = await realpath(source);
  if ((await verifyRun(root)).length)
    throw new Error("Source artifact integrity check failed");
  const manifest = JSON.parse(
    await readFile(join(root, "manifest.json"), "utf8"),
  );
  const files = Object.keys(manifest.files);
  if (files.some((name) => !allowed.has(name)))
    throw new Error("Unrecognized artifact: review before sharing");
  // Refuse symlinks and accidental exports into a run. Never overwrite an existing directory.
  for (const name of files) {
    if ((await lstat(join(root, name))).isSymbolicLink())
      throw new Error("Symlink artifacts cannot be exported");
  }
  const target = resolve(destination);
  if (target === root || target.startsWith(root + sep))
    throw new Error("Export outside the source run");
  await mkdir(target, { recursive: false });
  for (const name of [...files, "manifest.json"])
    await copyFile(join(root, name), join(target, name));
  await writeFile(
    join(target, "SHARING.txt"),
    "Synthetic reference evidence. Raw native logs, test credentials, client state and XCTest bundles excluded. Review your own adapter observations and video before publishing. Checksums establish integrity, not correctness or authorship.\n",
  );
}
