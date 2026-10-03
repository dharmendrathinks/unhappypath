import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
const root = resolve(process.argv[2]);
const output = process.argv[3];
if (!output)
  throw new Error(
    "Usage: record-verification.mjs <native-suite> <output.json>",
  );
const summary = JSON.parse(await readFile(join(root, "summary.json"), "utf8"));
if (summary.length !== 9) throw new Error("Expected the full nine-case matrix");
const keys = new Set();
const results = [];
for (const item of summary) {
  if (!/^[a-z0-9-]+$/.test(item.id)) throw new Error("Invalid run id");
  const run = JSON.parse(
    await readFile(join(root, item.id, "run.json"), "utf8"),
  );
  const key = `${run.scenario.id}/${run.variant}`;
  if (keys.has(key)) throw new Error("Duplicate case");
  keys.add(key);
  if (
    run.driver !== "ios" ||
    run.verdict !== (run.variant === "broken" ? "FAIL" : "PASS")
  )
    throw new Error(`Unexpected result: ${key}`);
  const identity = JSON.parse(run.environment.driverDetails.sourceIdentity);
  for (const [path, hash] of Object.entries(identity)) {
    if (
      ![
        "examples/ios/project.yml",
        "examples/ios/UnhappyPathDemo/App.swift",
        "examples/ios/UnhappyPathUITests/JourneyTests.swift",
      ].includes(path)
    )
      throw new Error("Unexpected source path");
    const current = createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
    if (current !== hash)
      throw new Error(`Source differs from tested build: ${path}`);
  }
  results.push({
    scenario: run.scenario.id,
    variant: run.variant,
    verdict: run.verdict,
    startedAt: run.startedAt,
    durationMs: run.durationMs,
    assertions: run.assertions,
    faultActivated: run.evidence.faultActivated,
    environment: run.environment,
  });
}
await writeFile(
  output,
  JSON.stringify(
    {
      schemaVersion: 1,
      description:
        "Observed synthetic native reference experiments; no external-app or physical-device claim.",
      results,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Recorded ${results.length} native results with matching source hashes.`,
);
