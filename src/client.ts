// A separate-process reference client for portable harness verification, not iOS evidence.
import {
  readFileSync,
  writeFileSync,
  existsSync,
  openSync,
  fsyncSync,
  closeSync,
} from "node:fs";
import { join } from "node:path";
import { DRAFT, INTENT } from "./model.js";
const url = process.env.UP_URL!;
const token = process.env.UP_TOKEN!;
const mode = process.env.UP_MODE;
const phase = process.env.UP_PHASE;
const scenario = process.env.UP_SCENARIO!;
const directory = process.env.UP_STATE!;
const file = join(directory, "client-state.json");
const state: { pending?: boolean; key?: string; draft?: string } = existsSync(
  file,
)
  ? JSON.parse(readFileSync(file, "utf8"))
  : {};
function save() {
  const fd = openSync(file, "w", 0o600);
  try {
    writeFileSync(fd, JSON.stringify(state));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
async function request(path: string, data?: unknown, key?: string) {
  const res = await fetch(`${url}${path}`, {
    method: data ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(key ? { "Idempotency-Key": key } : {}),
      "Content-Type": "application/json",
    },
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function observe(data: unknown) {
  await request("/control/observe", data);
}
async function book() {
  state.pending = true;
  state.key ??= "persisted-operation-key";
  save();
  await request(
    "/bookings",
    { intentId: INTENT },
    mode === "fixed" ? state.key : undefined,
  );
  state.pending = false;
  save();
  await observe({ confirmed: true, completed: true });
}
try {
  if (scenario === "booking") await book();
  else if (scenario === "draft") {
    if (phase === "first") {
      if (mode === "fixed") {
        state.draft = DRAFT;
        save();
      }
      await request("/control/event", { kind: "draft.saved" });
      if (process.env.UP_FAULT === "true")
        await new Promise(() => {
          setInterval(() => {}, 1000);
        });
      else await observe({ draft: DRAFT, completed: true });
    } else await observe({ draft: state.draft ?? "", completed: true });
  } else {
    let available = true;
    try {
      await request("/recommendations");
    } catch {
      available = false;
    }
    const enabled = available || mode === "fixed";
    if (enabled) await book();
    else
      await observe({
        bookingEnabled: false,
        confirmed: false,
        completed: true,
      });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Client failed");
  process.exitCode = 1;
}
