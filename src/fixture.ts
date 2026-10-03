import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomBytes } from "node:crypto";
import {
  mkdirSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";
import type { Booking, Event, ScenarioId, Snapshot, Variant } from "./model.js";

function persist(path: string, value: unknown): void {
  const temporary = `${path}.tmp`;
  const fd = openSync(temporary, "w", 0o600);
  try {
    writeFileSync(fd, JSON.stringify(value, null, 2));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
}
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) throw new Error("Body exceeds 16 KiB");
    chunks.push(chunk);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString() || "{}");
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new Error("Expected a JSON object");
  return parsed as Record<string, unknown>;
}
function reply(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}
export async function createFixture(options: {
  scenario: ScenarioId;
  variant: Variant;
  directory: string;
}) {
  mkdirSync(options.directory, { recursive: true });
  const token = randomBytes(24).toString("hex");
  const start = performance.now();
  const events: Event[] = [];
  const bookings: Booking[] = [];
  const keys = new Map<string, Booking>();
  let observations: Record<string, unknown> = {};
  let faultActivated = false;
  const add = (
    source: Event["source"],
    kind: string,
    detail: Record<string, unknown> = {},
  ) => {
    events.push({
      seq: events.length + 1,
      elapsedMs: Math.round(performance.now() - start),
      source,
      kind,
      detail,
    });
  };
  const snapshot = (): Snapshot =>
    structuredClone({ bookings, events, observations, faultActivated });
  const flush = () =>
    persist(join(options.directory, "fixture.json"), snapshot());
  const server = createServer((req, res) => {
    void handle(req, res).catch((error) => {
      add("fixture", "request.rejected", {
        reason: error instanceof Error ? error.message : "Invalid request",
      });
      if (!res.headersSent) reply(res, 400, { error: "Invalid request" });
      else res.end();
    });
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  async function handle(req: IncomingMessage, res: ServerResponse) {
    // No CORS, no browser-origin requests, loopback binding, and an ephemeral per-run capability.
    if (req.headers.origin || req.headers.authorization !== `Bearer ${token}`) {
      reply(res, 403, { error: "Forbidden" });
      return;
    }
    if (req.method === "GET" && req.url === "/control/config") {
      reply(res, 200, { scenario: options.scenario, variant: options.variant });
      return;
    }
    if (req.method === "GET" && req.url === "/control/state") {
      reply(res, 200, snapshot());
      return;
    }
    if (req.method === "POST" && req.url === "/control/observe") {
      const data = await body(req);
      const allowed = ["completed", "confirmed", "draft", "bookingEnabled"];
      if (Object.keys(data).some((k) => !allowed.includes(k)))
        throw new Error("Unknown observation");
      observations = { ...observations, ...data };
      add("driver", "observation", data);
      flush();
      reply(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && req.url === "/control/event") {
      const data = await body(req);
      const allowed = [
        "app.started",
        "app.terminated",
        "app.relaunched",
        "draft.saved",
        "journey.started",
      ];
      if (typeof data.kind !== "string" || !allowed.includes(data.kind))
        throw new Error("Unknown driver event");
      add("driver", data.kind);
      if (
        options.scenario === "draft" &&
        options.variant !== "baseline" &&
        data.kind === "app.terminated"
      ) {
        faultActivated = true;
        add("fixture", "fault.activated", {
          mechanism: "driver-observed process termination after save",
        });
      }
      flush();
      reply(res, 200, { ok: true });
      return;
    }
    if (req.method === "GET" && req.url === "/recommendations") {
      const fail =
        options.scenario === "dependency" && options.variant !== "baseline";
      add("fixture", "request.received", {
        method: "GET",
        path: "/recommendations",
      });
      if (fail) {
        faultActivated = true;
        add("fixture", "fault.activated", {
          mechanism: "recommendations HTTP 503",
        });
      }
      flush();
      reply(
        res,
        fail ? 503 : 200,
        fail
          ? { error: "Recommendations unavailable" }
          : { items: ["Window seat"] },
      );
      return;
    }
    if (req.method === "POST" && req.url === "/bookings") {
      const data = await body(req);
      const intentId = data.intentId;
      const key = req.headers["idempotency-key"];
      if (
        typeof intentId !== "string" ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(intentId)
      )
        throw new Error("Invalid intent");
      if (
        key !== undefined &&
        (typeof key !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(key))
      )
        throw new Error("Invalid operation key");
      add("fixture", "request.received", {
        method: "POST",
        path: "/bookings",
        intentId,
        operationKey: key ?? null,
      });
      let booking = typeof key === "string" ? keys.get(key) : undefined;
      if (booking && booking.intentId !== intentId) {
        reply(res, 409, { error: "Key reused with different intent" });
        return;
      }
      if (booking)
        add("fixture", "booking.deduplicated", { bookingId: booking.id });
      else {
        booking = {
          id: `booking-${bookings.length + 1}`,
          intentId,
          operationKey: typeof key === "string" ? key : null,
        };
        bookings.push(booking);
        if (typeof key === "string") keys.set(key, booking);
        add("fixture", "booking.committed", {
          bookingId: booking.id,
          count: bookings.length,
        });
        flush(); // fsync the ledger before activating the response fault.
      }
      if (
        options.scenario === "booking" &&
        options.variant !== "baseline" &&
        !faultActivated
      ) {
        faultActivated = true;
        add("fixture", "fault.activated", {
          mechanism: "response withheld after durable commit",
          bookingId: booking.id,
        });
        flush();
        // Intentionally held until the client terminates. No timer races and no simulated HTTP 500.
        req.socket.on("close", () =>
          add("fixture", "connection.closed", { bookingId: booking.id }),
        );
        return;
      }
      add("fixture", "response.sent", { status: 201, bookingId: booking.id });
      flush();
      reply(res, 201, booking);
      return;
    }
    reply(res, 404, { error: "Unknown fixture endpoint" });
  }
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture address");
  add("fixture", "fixture.started", {
    scenario: options.scenario,
    variant: options.variant,
  });
  flush();
  return {
    url: `http://127.0.0.1:${address.port}`,
    token,
    snapshot,
    add,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      add("fixture", "fixture.stopped");
      flush();
    },
  };
}
