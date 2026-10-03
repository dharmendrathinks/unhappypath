#!/usr/bin/env node
import { parseArgs } from "node:util";
import {
  readFile,
  mkdir,
  writeFile,
  realpath,
  readdir,
} from "node:fs/promises";
import { resolve, join, extname, sep } from "node:path";
import { createServer } from "node:http";
import { runExperiment, verifyRun } from "./runner.js";
import { processDriver } from "./drivers.js";
import { iosDriver } from "./ios-driver.js";
import {
  scenarioIds,
  type ScenarioId,
  type Variant,
  type RunResult,
} from "./model.js";
import { renderSummary } from "./report.js";
import { exportRun } from "./export.js";
const help = `UnhappyPath 0.1.0 — local failure experiments, no API key\n\n  unhappypath demo [--driver process|ios] [--scenario booking|draft|dependency] [--out runs/demo]\n  unhappypath run --scenario booking --variant broken|fixed|baseline [--driver process|ios]\n  unhappypath replay <run-directory> [--out runs/replay]\n  unhappypath export <run-directory> --out <new-directory>\n  unhappypath verify <run-directory>\n  unhappypath serve <report-directory> [--port 4173]\n\nDemo exits 0 only when healthy/fixed controls pass and deliberately broken cases fail.\nRun exits: 0 PASS, 1 FAIL, 2 INCONCLUSIVE/UNSUPPORTED/setup error.\nNative runs require npm run ios:prepare, Xcode, XcodeGen and an installed iOS runtime.\n`;
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      driver: { type: "string", default: "process" },
      scenario: { type: "string" },
      variant: { type: "string", default: "fixed" },
      out: { type: "string" },
      port: { type: "string", default: "4173" },
      help: { type: "boolean", short: "h" },
    },
  });
  const command = positionals[0];
  if (values.help || !command) {
    console.log(help);
    return;
  }
  if (!["process", "ios"].includes(values.driver))
    throw new Error("Driver must be process or ios");
  const driver = values.driver === "ios" ? iosDriver : processDriver;
  const output = resolve(
    values.out ??
      `runs/${command}-${new Date().toISOString().replaceAll(":", "-")}`,
  );
  if (command === "export") {
    if (!positionals[1] || !values.out)
      throw new Error("Provide a run directory and --out new-directory");
    await exportRun(resolve(positionals[1]), output);
    console.log(`Shareable reference artifacts: ${output}`);
    return;
  }
  if (command === "verify") {
    if (!positionals[1]) throw new Error("Provide a run directory");
    const failures = await verifyRun(resolve(positionals[1]));
    console.log(
      failures.length
        ? `MISMATCH: ${failures.join(", ")}`
        : "Artifact checksums match. This verifies integrity, not correctness or authorship.",
    );
    process.exitCode = failures.length ? 1 : 0;
    return;
  }
  if (command === "serve") {
    if (!positionals[1]) throw new Error("Provide a report directory");
    const root = await realpath(resolve(positionals[1]));
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535)
      throw new Error("Invalid port");
    const types: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".json": "application/json",
      ".mp4": "video/mp4",
      ".png": "image/png",
      ".md": "text/plain; charset=utf-8",
    };
    const server = createServer((req, res) => {
      void (async () => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405);
          res.end();
          return;
        }
        const path = decodeURIComponent(
          new URL(req.url ?? "/", "http://localhost").pathname,
        );
        const file = await realpath(
          resolve(root, `.${path.endsWith("/") ? `${path}index.html` : path}`),
        );
        if (!file.startsWith(root + sep) || !(extname(file) in types)) {
          res.writeHead(403);
          res.end();
          return;
        }
        const data = await readFile(file);
        let start = 0;
        let end = data.length - 1;
        if (req.headers.range) {
          const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
          if (match) {
            start = Number(match[1]);
            end = match[2] ? Math.min(Number(match[2]), end) : end;
          }
          if (!match || start > end || start >= data.length) {
            res.writeHead(416, { "Content-Range": `bytes */${data.length}` });
            res.end();
            return;
          }
        }
        res.writeHead(req.headers.range ? 206 : 200, {
          ...(req.headers.range
            ? { "Content-Range": `bytes ${start}-${end}/${data.length}` }
            : {}),
          "Accept-Ranges": "bytes",
          "Content-Type": types[extname(file)]!,
          "Content-Length": end - start + 1,
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "Cache-Control": "no-store",
        });
        res.end(
          req.method === "HEAD" ? undefined : data.subarray(start, end + 1),
        );
      })().catch(() => {
        res.writeHead(404);
        res.end("Not found");
      });
    });
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      console.log(
        `Report: http://127.0.0.1:${typeof address === "object" && address ? address.port : port}`,
      );
    });
    return;
  }
  if (!["demo", "run", "replay"].includes(command))
    throw new Error(`Unknown command: ${command}`);
  const controller = new AbortController();
  const cancel = () => controller.abort(new Error("Run interrupted"));
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  const runs: RunResult[] = [];
  try {
    let cases: {
      scenario: ScenarioId;
      variant: Variant;
      driver: typeof driver;
    }[];
    if (command === "replay") {
      if (!positionals[1]) throw new Error("Provide a run directory");
      const source = resolve(positionals[1]);
      if ((await verifyRun(source)).length)
        throw new Error("Replay input failed integrity check");
      const previous = JSON.parse(
        await readFile(join(source, "run.json"), "utf8"),
      ) as RunResult;
      if (
        previous.schemaVersion !== 1 ||
        !["process", "ios"].includes(previous.driver)
      )
        throw new Error("Unsupported result format or driver");
      cases = [
        {
          scenario: previous.scenario.id,
          variant: previous.variant,
          driver: previous.driver === "ios" ? iosDriver : processDriver,
        },
      ];
    } else {
      if (
        values.scenario &&
        !scenarioIds.includes(values.scenario as ScenarioId)
      )
        throw new Error("Unknown scenario");
      if (!["baseline", "broken", "fixed"].includes(values.variant))
        throw new Error("Unknown variant");
      if (command === "run" && !values.scenario)
        throw new Error("run requires --scenario");
      const selected = values.scenario
        ? [values.scenario as ScenarioId]
        : [...scenarioIds];
      cases = selected.flatMap((scenario) =>
        (command === "demo"
          ? (["baseline", "broken", "fixed"] as Variant[])
          : [values.variant as Variant]
        ).map((variant) => ({ scenario, variant, driver })),
      );
    }
    await mkdir(output, { recursive: true, mode: 0o700 });
    if ((await readdir(output)).length)
      throw new Error(
        "Output directory must be empty; choose a new --out path",
      );
    for (const item of cases) {
      controller.signal.throwIfAborted();
      console.log(
        `Running ${item.scenario} / ${item.variant} / ${item.driver.name}…`,
      );
      const run = await runExperiment({
        ...item,
        output,
        signal: controller.signal,
      });
      runs.push(run);
      console.log(`${run.verdict} — ${run.reason}`);
      await writeFile(
        join(output, "summary.json"),
        JSON.stringify(
          runs.map((r) => ({
            id: r.id,
            scenario: r.scenario.id,
            variant: r.variant,
            driver: r.driver,
            verdict: r.verdict,
          })),
          null,
          2,
        ),
      );
      await writeFile(join(output, "index.html"), renderSummary(runs));
    }
    const success =
      command === "demo"
        ? runs.every(
            (r) => r.verdict === (r.variant === "broken" ? "FAIL" : "PASS"),
          )
        : runs.every((r) => r.verdict === "PASS");
    process.exitCode = success
      ? 0
      : runs.some(
            (r) => r.verdict === "INCONCLUSIVE" || r.verdict === "UNSUPPORTED",
          )
        ? 2
        : 1;
    console.log(`\nReport: ${join(output, "index.html")}`);
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
