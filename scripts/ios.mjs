import { spawn, execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  copyFile,
  access,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("..", import.meta.url));
const cache = join(root, ".cache", "ios");
const products = join(cache, "build", "Build", "Products");
const command = process.argv[2];
const exec = (program, args) =>
  execFileSync(program, args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
async function run(program, args, log, extra = {}) {
  const child = spawn(program, args, {
    stdio: ["ignore", "pipe", "pipe"],
    ...extra,
  });
  let tail = "";
  if (log) await writeFile(log, "", { mode: 0o600 });
  const collect = (c) => {
    if (log) appendFileSync(log, c);
    tail = (tail + String(c)).slice(-6000);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  const abort = () => child.kill("SIGTERM");
  process.once("SIGTERM", abort);
  process.once("SIGINT", abort);
  const timer = setTimeout(() => child.kill("SIGTERM"), 300000);
  let code;
  try {
    code = await new Promise((done, fail) => {
      child.once("error", fail);
      child.once("exit", done);
    });
  } finally {
    clearTimeout(timer);
    process.removeListener("SIGTERM", abort);
    process.removeListener("SIGINT", abort);
  }

  if (code !== 0) throw new Error(`${program} failed (${code}): ${tail}`);
}
async function sourceIdentity() {
  const files = [
    "examples/ios/project.yml",
    "examples/ios/UnhappyPathDemo/App.swift",
    "examples/ios/UnhappyPathUITests/JourneyTests.swift",
  ];
  const identity = {};
  for (const file of files)
    identity[file] = createHash("sha256")
      .update(await readFile(join(root, file)))
      .digest("hex");
  return identity;
}
async function main() {
  if (process.platform !== "darwin")
    throw new Error("Native driver requires macOS");
  await mkdir(cache, { recursive: true });
  if (command === "prepare") {
    console.log("Generating and building the simulator fixture…");
    exec("xcodegen", [
      "generate",
      "--spec",
      join(root, "examples/ios/project.yml"),
      "--project",
      cache,
    ]);
    await run(
      "xcodebuild",
      [
        "build-for-testing",
        "-project",
        join(cache, "UnhappyPathDemo.xcodeproj"),
        "-scheme",
        "UnhappyPathDemo",
        "-destination",
        "generic/platform=iOS Simulator",
        "-derivedDataPath",
        join(cache, "build"),
        "CODE_SIGNING_ALLOWED=NO",
      ],
      join(cache, "build.log"),
    );
    await writeFile(
      join(cache, "build-identity.json"),
      JSON.stringify(await sourceIdentity()),
    );
    console.log("iOS fixture built. Run npm run ios:demo.");
    return;
  }
  if (command !== "run" || !process.argv[3])
    throw new Error("Usage: ios.mjs prepare | run <artifact-directory>");
  const directory = resolve(process.argv[3]);
  await mkdir(directory, { recursive: true });
  const names = await readdir(products).catch(() => []);
  const template = names.find((n) => n.endsWith(".xctestrun"));
  if (!template) throw new Error("Run npm run ios:prepare first");
  const built = JSON.parse(
    await readFile(join(cache, "build-identity.json"), "utf8"),
  );
  if (JSON.stringify(built) !== JSON.stringify(await sourceIdentity()))
    throw new Error("Native source changed: run npm run ios:prepare again");
  const runtimes = JSON.parse(
    exec("xcrun", ["simctl", "list", "runtimes", "-j"]),
  ).runtimes.filter(
    (r) =>
      r.isAvailable &&
      r.identifier.includes(".iOS-") &&
      Number(r.version.split(".")[0]) >= 18,
  );
  const selected = process.env.UP_IOS_RUNTIME
    ? runtimes.find((r) => r.identifier === process.env.UP_IOS_RUNTIME)
    : (runtimes.find((r) => r.version.startsWith("18.")) ?? runtimes[0]);
  if (!selected)
    throw new Error("Install an iOS Simulator runtime through Xcode");
  const device = selected.supportedDeviceTypes.find(
    (d) => d.productFamily === "iPhone",
  );
  if (!device) throw new Error("Runtime has no supported iPhone device");
  const udid = exec("xcrun", [
    "simctl",
    "create",
    `UnhappyPath-${Date.now()}`,
    device.identifier,
    selected.identifier,
  ]).trim();
  let recorder;
  let recorderDone;
  let canceled = false;
  const cancel = () => {
    canceled = true;
  };
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  try {
    console.log(`  Disposable ${selected.name} simulator`);
    exec("xcrun", ["simctl", "boot", udid]);
    await run("xcrun", ["simctl", "bootstatus", udid, "-b"], null);
    if (canceled) throw new Error("Canceled");
    const xctestrun = join(directory, "native.xctestrun");
    // Resolve __TESTROOT__ before moving the generated test plan into the run directory.
    const patch = `import plistlib,sys\np=sys.argv\nd=plistlib.load(open(p[1],'rb'))\ndef walk(x):\n if isinstance(x,dict):\n  for k,v in list(x.items()):\n   if k == 'EnvironmentVariables': x[k]={**v,'UP_URL':p[4],'UP_TOKEN':p[5]}\n   else: x[k]=walk(v)\n  if 'TestBundlePath' in x: x['EnvironmentVariables']={**x.get('EnvironmentVariables',{}),'UP_URL':p[4],'UP_TOKEN':p[5]}\n  return x\n if isinstance(x,list): return [walk(v) for v in x]\n if isinstance(x,str): return x.replace('__TESTROOT__',p[3])\n return x\nplistlib.dump(walk(d),open(p[2],'wb'))`;
    exec("python3", [
      "-c",
      patch,
      join(products, template),
      xctestrun,
      products,
      process.env.UP_URL,
      process.env.UP_TOKEN,
    ]);
    recorder = spawn(
      "xcrun",
      [
        "simctl",
        "io",
        udid,
        "recordVideo",
        "--codec=h264",
        join(directory, "recording.mp4"),
      ],
      { stdio: "ignore" },
    );
    recorderDone = new Promise((done) => recorder.once("exit", done));
    await run(
      "xcodebuild",
      [
        "test-without-building",
        "-xctestrun",
        xctestrun,
        "-destination",
        `platform=iOS Simulator,id=${udid}`,
        "-parallel-testing-enabled",
        "NO",
        "-maximum-concurrent-test-simulator-destinations",
        "1",
        "-resultBundlePath",
        join(directory, "native.xcresult"),
      ],
      join(directory, "native.log"),
    );
    const attachments = join(directory, "attachments");
    exec("xcrun", [
      "xcresulttool",
      "export",
      "attachments",
      "--path",
      join(directory, "native.xcresult"),
      "--output-path",
      attachments,
    ]);
    const manifest = JSON.parse(
      await readFile(join(attachments, "manifest.json"), "utf8"),
    );
    const final = manifest
      .flatMap((item) => item.attachments)
      .find((a) =>
        a.suggestedHumanReadableName.startsWith("Final observable state"),
      );
    if (!final)
      throw new Error("Native run did not capture the final app screen");
    await copyFile(
      join(attachments, final.exportedFileName),
      join(directory, "screen.png"),
    );
    await writeFile(
      join(directory, "driver.json"),
      JSON.stringify(
        {
          driver: "ios",
          runtime: selected.version,
          runtimeBuild: selected.buildversion,
          device: device.name,
          xcode: exec("xcodebuild", ["-version"]).trim(),
          sourceIdentity: JSON.stringify(built),
          termination: "XCUIApplication.terminate; not jetsam",
        },
        null,
        2,
      ),
    );
  } finally {
    if (recorder && recorder.exitCode === null) {
      recorder.kill("SIGINT");
      await recorderDone;
    }
    try {
      exec("xcrun", ["simctl", "shutdown", udid]);
    } catch {
      /* Device may not have booted. */
    }
    exec("xcrun", ["simctl", "delete", udid]);
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
