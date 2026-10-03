import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Driver } from "./drivers.js";
export const iosDriver: Driver = {
  name: "ios",
  details: {},
  limitations: [
    "XCTest drives a synthetic SwiftUI app on a disposable iOS Simulator.",
    "XCTest termination is not jetsam, a crash, radio loss, or a physical-device test.",
    "The withheld response is controlled by a local test backend; arbitrary production APIs need integration.",
  ],
  async run({ fixture, directory, signal }) {
    if (process.platform !== "darwin")
      throw new Error("iOS driver requires macOS and Xcode");
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL("../scripts/ios.mjs", import.meta.url)),
        "run",
        directory,
      ],
      {
        env: { ...process.env, UP_URL: fixture.url, UP_TOKEN: fixture.token },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let tail = "";
    child.stdout!.on("data", (c) => process.stdout.write(c));
    child.stderr!.on("data", (c) => {
      tail = (tail + String(c)).slice(-4000);
      process.stderr.write(c);
    });
    const cancel = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      const code = await new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", resolve);
      });
      if (code !== 0)
        throw new Error(`Native driver failed (${code}): ${tail.slice(-1000)}`);
      const details = JSON.parse(
        await readFile(join(directory, "driver.json"), "utf8"),
      ) as Record<string, string>;
      this.details = details;
      return ["driver.json", "recording.mp4", "screen.png"];
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  },
};
