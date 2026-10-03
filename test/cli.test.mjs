import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  rm,
  symlink,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
const cli = resolve("dist/cli.js");
async function execute(args) {
  const child = spawn(process.execPath, [cli, ...args]);
  let output = "";
  child.stdout.on("data", (c) => (output += c));
  child.stderr.on("data", (c) => (output += c));
  const code = await new Promise((done, fail) => {
    child.once("error", fail);
    child.once("exit", done);
  });
  return { code, output };
}
test("CLI preserves failure exit status, replay result, and prior output", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "unhappypath-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const out = join(root, "first");
  const failed = await execute([
    "run",
    "--scenario",
    "booking",
    "--variant",
    "broken",
    "--out",
    out,
  ]);
  assert.equal(failed.code, 1);
  assert.match(failed.output, /FAIL/);
  const summary = JSON.parse(await readFile(join(out, "summary.json"), "utf8"));
  const replay = await execute([
    "replay",
    join(out, summary[0].id),
    "--out",
    join(root, "replay"),
  ]);
  assert.equal(replay.code, 1);
  const overwrite = await execute(["demo", "--out", out]);
  assert.equal(overwrite.code, 2);
  assert.match(overwrite.output, /must be empty/);
  const invalid = await execute([
    "run",
    "--scenario",
    "unknown",
    "--out",
    join(root, "invalid"),
  ]);
  assert.equal(invalid.code, 2);
});
test("report server handles byte ranges and refuses symlink escapes and writes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "unhappypath-server-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const served = join(root, "served");
  await mkdir(served);
  await writeFile(join(served, "index.html"), "0123456789");
  await writeFile(join(root, "private.json"), "secret");
  await symlink(join(root, "private.json"), join(served, "escape.json"));
  const child = spawn(process.execPath, [cli, "serve", served, "--port", "0"]);
  t.after(async () => {
    child.kill();
    await new Promise((done) => child.once("exit", done));
  });
  const base = await new Promise((done, fail) => {
    child.stdout.on("data", (c) => {
      const match = String(c).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) done(match[0]);
    });
    child.once("error", fail);
  });
  const range = await fetch(base + "/index.html", {
    headers: { Range: "bytes=2-5" },
  });
  assert.equal(range.status, 206);
  assert.equal(await range.text(), "2345");
  assert.equal(
    (await fetch(base + "/index.html", { headers: { Range: "bytes=100-" } }))
      .status,
    416,
  );
  assert.equal((await fetch(base + "/escape.json")).status, 403);
  assert.equal(
    (await fetch(base + "/index.html", { method: "POST" })).status,
    405,
  );
});
