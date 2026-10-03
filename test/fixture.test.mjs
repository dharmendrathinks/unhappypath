import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFixture } from "../dist/index.js";
async function fixture(t, variant = "baseline") {
  const directory = await mkdtemp(join(tmpdir(), "unhappypath-fixture-"));
  const f = await createFixture({ scenario: "booking", variant, directory });
  t.after(async () => {
    await f.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { ...f, directory };
}
const post = (f, data, key = "same-operation") =>
  fetch(f.url + "/bookings", {
    method: "POST",
    headers: { Authorization: `Bearer ${f.token}`, "Idempotency-Key": key },
    body: JSON.stringify(data),
  });
test("same operation is atomic under concurrent retries and changed intent conflicts", async (t) => {
  const f = await fixture(t);
  const results = await Promise.all(
    Array.from({ length: 12 }, () => post(f, { intentId: "same-intent" })),
  );
  assert.ok(results.every((r) => r.status === 201));
  assert.equal(f.snapshot().bookings.length, 1);
  const different = await post(f, { intentId: "different-intent" });
  assert.equal(different.status, 409);
  assert.equal(f.snapshot().bookings.length, 1);
});
test("response is withheld only after ledger persistence", async (t) => {
  const f = await fixture(t, "fixed");
  const abort = new AbortController();
  const pending = fetch(f.url + "/bookings", {
    method: "POST",
    headers: { Authorization: `Bearer ${f.token}` },
    body: JSON.stringify({ intentId: "test" }),
    signal: abort.signal,
  }).catch(() => null);
  for (let i = 0; i < 200 && !f.snapshot().faultActivated; i++)
    await new Promise((r) => setTimeout(r, 5));
  assert.equal(f.snapshot().faultActivated, true);
  const disk = JSON.parse(
    await readFile(join(f.directory, "fixture.json"), "utf8"),
  );
  assert.equal(disk.bookings.length, 1);
  assert.ok(disk.events.find((e) => e.kind === "booking.committed"));
  abort.abort();
  await pending;
});
test("capabilities isolate runs; browser origins, unknown routes and oversized inputs are rejected", async (t) => {
  const f = await fixture(t);
  assert.equal((await fetch(f.url + "/control/state")).status, 403);
  assert.equal(
    (
      await fetch(f.url + "/control/state", {
        headers: {
          Authorization: `Bearer ${f.token}`,
          Origin: "http://evil.example",
        },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(f.url + "/unknown", {
        headers: { Authorization: `Bearer ${f.token}` },
      })
    ).status,
    404,
  );
  assert.equal((await post(f, { intentId: "x".repeat(17000) })).status, 400);
  assert.equal(f.snapshot().bookings.length, 0);
  assert.equal(JSON.stringify(f.snapshot()).includes(f.token), false);
});
