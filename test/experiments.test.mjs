import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runExperiment,
  verifyRun,
  processDriver,
  scenarioIds,
} from "../dist/index.js";

for (const scenario of scenarioIds) {
  test(`${scenario}: same contract separates baseline, defect and fix`, async (t) => {
    const output = await mkdtemp(join(tmpdir(), "unhappypath-test-"));
    t.after(() => rm(output, { recursive: true, force: true }));
    const runs = [];
    for (const variant of ["baseline", "broken", "fixed"]) {
      const run = await runExperiment({
        scenario,
        variant,
        driver: processDriver,
        output,
      });
      runs.push(run);
      assert.equal(run.verdict, variant === "broken" ? "FAIL" : "PASS");
      assert.equal(run.evidence.faultActivated, variant !== "baseline");
      assert.deepEqual(await verifyRun(join(output, run.id)), []);
    }
    assert.deepEqual(
      runs[0].assertions.map(({ id, expected }) => ({ id, expected })),
      runs[1].assertions.map(({ id, expected }) => ({ id, expected })),
    );
    assert.deepEqual(
      runs[1].assertions.map(({ id, expected }) => ({ id, expected })),
      runs[2].assertions.map(({ id, expected }) => ({ id, expected })),
    );
    if (scenario === "booking") {
      assert.equal(runs[1].evidence.bookings.length, 2);
      assert.equal(runs[2].evidence.bookings.length, 1);
      const events = runs[2].evidence.events;
      assert.ok(
        events.findIndex((e) => e.kind === "booking.committed") <
          events.findIndex((e) => e.kind === "fault.activated"),
      );
      assert.ok(
        events.findIndex((e) => e.kind === "fault.activated") <
          events.findIndex((e) => e.kind === "app.terminated"),
      );
      assert.ok(
        events.findIndex((e) => e.kind === "app.relaunched") <
          events.findIndex((e) => e.kind === "booking.deduplicated"),
      );
    }
  });
}
test("missing fault and broken driver cannot produce a green result", async (t) => {
  const output = await mkdtemp(join(tmpdir(), "unhappypath-test-"));
  t.after(() => rm(output, { recursive: true, force: true }));
  const driver = {
    name: "incomplete",
    details: {},
    limitations: [],
    async run() {
      return [];
    },
  };
  const incomplete = await runExperiment({
    scenario: "booking",
    variant: "fixed",
    driver,
    output,
  });
  assert.equal(incomplete.verdict, "INCONCLUSIVE");
  assert.deepEqual(incomplete.assertions, []);
  driver.run = async () => {
    throw new Error("Harness disconnected");
  };
  const broken = await runExperiment({
    scenario: "booking",
    variant: "fixed",
    driver,
    output,
  });
  assert.equal(broken.verdict, "INCONCLUSIVE");
  assert.match(broken.reason, /Harness disconnected/);
  assert.equal(broken.evidence.events.at(-1).kind, "fixture.stopped");
});
test("integrity verification detects edited artifacts and rejects path traversal", async (t) => {
  const output = await mkdtemp(join(tmpdir(), "unhappypath-test-"));
  t.after(() => rm(output, { recursive: true, force: true }));
  const run = await runExperiment({
    scenario: "booking",
    variant: "baseline",
    driver: processDriver,
    output,
  });
  const dir = join(output, run.id);
  await writeFile(join(dir, "run.json"), "{}");
  assert.deepEqual(await verifyRun(dir), ["run.json"]);
  await writeFile(
    join(dir, "manifest.json"),
    JSON.stringify({
      algorithm: "sha256",
      files: { "run.json": "x", "../outside": "x" },
    }),
  );
  await assert.rejects(verifyRun(dir), /Unsafe manifest path/);
});
test("simultaneous independent fixtures do not share booking state", async (t) => {
  const output = await mkdtemp(join(tmpdir(), "unhappypath-test-"));
  t.after(() => rm(output, { recursive: true, force: true }));
  const results = await Promise.all(
    ["broken", "fixed"].map((variant) =>
      runExperiment({
        scenario: "booking",
        variant,
        driver: processDriver,
        output,
      }),
    ),
  );
  assert.deepEqual(
    results.map((r) => r.evidence.bookings.length),
    [2, 1],
  );
});

test("sharing export omits credential-bearing native artifacts and refuses overwrites", async (t) => {
  const { exportRun } = await import("../dist/export.js");
  const root = await mkdtemp(join(tmpdir(), "unhappypath-export-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const run = await runExperiment({
    scenario: "booking",
    variant: "fixed",
    driver: processDriver,
    output: root,
  });
  const source = join(root, run.id);
  await writeFile(join(source, "native.xctestrun"), "PRIVATE-CAPABILITY");
  const target = join(root, "shared");
  await exportRun(source, target);
  await assert.rejects(readFile(join(target, "native.xctestrun")));
  assert.deepEqual(await verifyRun(target), []);
  await assert.rejects(exportRun(source, target));
});
