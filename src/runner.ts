import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { createHash, randomBytes } from "node:crypto";
import { createFixture } from "./fixture.js";
import {
  evaluate,
  scenarios,
  type ScenarioId,
  type Variant,
  type RunResult,
} from "./model.js";
import type { Driver } from "./drivers.js";
import { renderRun, renderMarkdown } from "./report.js";
export async function runExperiment(options: {
  scenario: ScenarioId;
  variant: Variant;
  driver: Driver;
  output: string;
  signal?: AbortSignal;
}): Promise<RunResult> {
  if (
    !scenarios[options.scenario] ||
    !["baseline", "broken", "fixed"].includes(options.variant)
  )
    throw new Error("Unknown scenario or variant");
  const started = Date.now();
  const startedAt = new Date().toISOString();
  const id = `${options.scenario}-${options.variant}-${randomBytes(4).toString("hex")}`;
  const directory = join(options.output, id);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const fixture = await createFixture({
    scenario: options.scenario,
    variant: options.variant,
    directory,
  });
  let artifacts: string[] = [];
  let error: string | undefined;
  try {
    artifacts = await options.driver.run({
      fixture,
      scenario: options.scenario,
      variant: options.variant,
      directory,
      signal: options.signal,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : "Driver failed";
    error = error
      .replaceAll(fixture.token, "[redacted]")
      .replaceAll(resolve(options.output), "<output>")
      .replaceAll(homedir(), "<home>");
    fixture.add("runner", "driver.failed", { reason: error });
  } finally {
    await fixture.close();
  }
  const evidence = fixture.snapshot();
  const result = evaluate(options.scenario, options.variant, evidence);
  const run: RunResult = {
    schemaVersion: 1,
    id,
    startedAt,
    durationMs: Date.now() - started,
    scenario: scenarios[options.scenario],
    variant: options.variant,
    driver: options.driver.name,
    ...result,
    ...(error
      ? {
          verdict: "INCONCLUSIVE" as const,
          reason: `Driver did not complete: ${error}`,
          assertions: [],
        }
      : {}),
    evidence,
    artifacts: [...artifacts, "fixture.json"],
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      packageVersion: "0.1.0",
      driverDetails: options.driver.details,
    },
    limitations: [
      ...options.driver.limitations,
      "Only declared invariants and observed events are evaluated. A pass is not production certification.",
      "App-specific setup and observable state are required for integrating other applications.",
    ],
  };
  await writeFile(join(directory, "run.json"), JSON.stringify(run, null, 2));
  await writeFile(join(directory, "report.html"), renderRun(run));
  await writeFile(join(directory, "report.md"), renderMarkdown(run));
  const files = ["run.json", "report.html", "report.md", ...run.artifacts];
  const checksums: Record<string, string> = {};
  for (const name of files) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(name))
      throw new Error("Unsafe artifact name");
    checksums[name] = createHash("sha256")
      .update(await readFile(join(directory, name)))
      .digest("hex");
  }
  await writeFile(
    join(directory, "manifest.json"),
    JSON.stringify({ algorithm: "sha256", files: checksums }, null, 2),
  );
  return run;
}
export async function verifyRun(directory: string): Promise<string[]> {
  const manifest = JSON.parse(
    await readFile(join(directory, "manifest.json"), "utf8"),
  ) as { algorithm: string; files: Record<string, string> };
  if (
    manifest.algorithm !== "sha256" ||
    !manifest.files ||
    !Object.keys(manifest.files).includes("run.json")
  )
    throw new Error("Invalid manifest");
  const failures: string[] = [];
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(name) || name === "..")
      throw new Error("Unsafe manifest path");
    try {
      const actual = createHash("sha256")
        .update(await readFile(join(directory, name)))
        .digest("hex");
      if (actual !== expected) failures.push(name);
    } catch {
      failures.push(name);
    }
  }
  return failures;
}
