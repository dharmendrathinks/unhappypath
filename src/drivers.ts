import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { createFixture } from "./fixture.js";
import type { ScenarioId, Variant } from "./model.js";
export type Fixture = Awaited<ReturnType<typeof createFixture>>;
export interface DriverContext {
  fixture: Fixture;
  scenario: ScenarioId;
  variant: Variant;
  directory: string;
  signal?: AbortSignal;
}
export interface Driver {
  name: string;
  details: Record<string, string>;
  limitations: string[];
  run(context: DriverContext): Promise<string[]>;
}
export async function waitFor(
  check: () => boolean,
  timeoutMs = 15000,
  signal?: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    signal?.throwIfAborted();
    if (Date.now() >= deadline)
      throw new Error("Timed out waiting for required evidence");
    await new Promise((r) => setTimeout(r, 30));
  }
}
export const processDriver: Driver = {
  name: "process",
  details: { runtime: process.version },
  limitations: [
    "Portable Node reference client. This is not an iOS or Android run.",
    "Synthetic local fixtures; no radio, OS memory-pressure, or physical-device behavior is tested.",
  ],
  async run({ fixture, scenario, variant, directory, signal }) {
    const stateDirectory = join(directory, "client");
    await mkdir(stateDirectory);
    const children = new Set<ReturnType<typeof spawn>>();
    function start(phase: string) {
      signal?.throwIfAborted();
      const child = spawn(
        process.execPath,
        [fileURLToPath(new URL("./client.js", import.meta.url))],
        {
          env: {
            ...process.env,
            UP_URL: fixture.url,
            UP_TOKEN: fixture.token,
            UP_MODE: variant === "fixed" ? "fixed" : "broken",
            UP_PHASE: phase,
            UP_SCENARIO: scenario,
            UP_STATE: stateDirectory,
            UP_FAULT: String(variant !== "baseline"),
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      children.add(child);
      let errors = "";
      child.stderr!.on("data", (c) => {
        errors = (errors + String(c)).slice(-2000);
      });
      const done = new Promise<{ code: number | null; signal: string | null }>(
        (resolve, reject) => {
          child.once("error", reject);
          child.once("exit", (code, sig) => resolve({ code, signal: sig }));
        },
      );
      void done.catch(() => {});
      return { child, done, errors: () => errors };
    }
    const terminate = () => {
      for (const child of children)
        if (child.exitCode === null) child.kill("SIGKILL");
    };
    signal?.addEventListener("abort", terminate, { once: true });
    try {
      fixture.add("driver", "app.started");
      const first = start("first");
      if (variant !== "baseline" && scenario !== "dependency") {
        await waitFor(
          () => {
            if (first.child.exitCode !== null)
              throw new Error(`Client exited before fault: ${first.errors()}`);
            return scenario === "booking"
              ? fixture.snapshot().faultActivated
              : fixture.snapshot().events.some((e) => e.kind === "draft.saved");
          },
          15000,
          signal,
        );
        first.child.kill("SIGKILL");
        await first.done;
        fixture.add("driver", "app.terminated");
        if (scenario === "draft") {
          await fetch(`${fixture.url}/control/event`, {
            method: "POST",
            headers: { Authorization: `Bearer ${fixture.token}` },
            body: JSON.stringify({ kind: "app.terminated" }),
          });
        }
        fixture.add("driver", "app.relaunched");
        const second = start("retry");
        await waitFor(() => second.child.exitCode !== null, 15000, signal);
        const result = await second.done;
        if (result.code !== 0)
          throw new Error(`Retry client failed: ${second.errors()}`);
      } else {
        await waitFor(() => first.child.exitCode !== null, 15000, signal);
        const result = await first.done;
        if (result.code !== 0)
          throw new Error(`Client failed: ${first.errors()}`);
      }
      await writeFile(
        join(directory, "driver.json"),
        JSON.stringify(
          {
            driver: "process",
            restart: variant !== "baseline" && scenario !== "dependency",
          },
          null,
          2,
        ),
      );
      return ["driver.json"];
    } finally {
      terminate();
      signal?.removeEventListener("abort", terminate);
    }
  },
};
