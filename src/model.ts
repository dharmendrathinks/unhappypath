export const scenarioIds = ["booking", "draft", "dependency"] as const;
export type ScenarioId = (typeof scenarioIds)[number];
export type Variant = "baseline" | "broken" | "fixed";
export type Verdict = "PASS" | "FAIL" | "INCONCLUSIVE" | "UNSUPPORTED";
export interface Scenario {
  id: ScenarioId;
  title: string;
  question: string;
  fault: string;
  explanation: string;
}
export const scenarios: Record<ScenarioId, Scenario> = {
  booking: {
    id: "booking",
    title: "One tap. One booking.",
    question: "Did retrying an uncertain request create a second booking?",
    fault:
      "Withhold the first response after the booking is durably recorded; terminate and relaunch the client.",
    explanation:
      "A missing response does not mean the write failed. Persist an operation key before sending and reuse it after restart. The server must atomically associate that key with the committed result.",
  },
  draft: {
    id: "draft",
    title: "Saved must mean saved.",
    question: "Does a draft acknowledged as saved survive reopening?",
    fault:
      "Terminate and relaunch the client after it acknowledges saving the draft.",
    explanation:
      "An in-memory update can look saved until the process disappears. Acknowledge the save only after durable local persistence succeeds.",
  },
  dependency: {
    id: "dependency",
    title: "Recommendations are optional.",
    question: "Can a nonessential dependency prevent a core booking?",
    fault:
      "Return HTTP 503 from recommendations while the booking API remains healthy.",
    explanation:
      "An optional dependency must not become a prerequisite for a critical user journey. Degrade the optional feature and verify the core transaction independently.",
  },
};
export interface Event {
  seq: number;
  elapsedMs: number;
  source: "fixture" | "driver" | "runner";
  kind: string;
  detail: Record<string, unknown>;
}
export interface Booking {
  id: string;
  intentId: string;
  operationKey: string | null;
}
export interface Snapshot {
  bookings: Booking[];
  events: Event[];
  observations: Record<string, unknown>;
  faultActivated: boolean;
}
export interface Assertion {
  id: string;
  description: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
}
export interface RunResult {
  schemaVersion: 1;
  id: string;
  startedAt: string;
  durationMs: number;
  scenario: Scenario;
  variant: Variant;
  driver: string;
  verdict: Verdict;
  reason: string;
  assertions: Assertion[];
  evidence: Snapshot;
  artifacts: string[];
  environment: {
    node: string;
    platform: string;
    arch: string;
    packageVersion: string;
    driverDetails: Record<string, string>;
  };
  limitations: string[];
}
export const DRAFT = "Remember the umbrella.";
export const INTENT = "one-user-intent";
export function evaluate(
  scenario: ScenarioId,
  variant: Variant,
  snapshot: Snapshot,
): { verdict: Verdict; reason: string; assertions: Assertion[] } {
  const observations = snapshot.observations;
  const eventIndex = (kind: string, source: Event["source"]) =>
    snapshot.events.findIndex((e) => e.kind === kind && e.source === source);
  const started = eventIndex("app.started", "driver");
  const terminated = eventIndex("app.terminated", "driver");
  const relaunched = eventIndex("app.relaunched", "driver");
  const saved = eventIndex("draft.saved", "driver");
  const fault = eventIndex("fault.activated", "fixture");
  const orderedRestart = terminated > started && relaunched > terminated;
  const interruptedAfterBoundary =
    scenario === "booking"
      ? fault > started && terminated > fault
      : saved > started && terminated > saved;
  if (
    observations.completed !== true ||
    started < 0 ||
    (scenario === "draft" && saved < 0) ||
    (variant !== "baseline" && (!snapshot.faultActivated || fault < 0)) ||
    (variant !== "baseline" &&
      scenario !== "dependency" &&
      (!orderedRestart || !interruptedAfterBoundary))
  ) {
    return {
      verdict: "INCONCLUSIVE",
      reason: "The journey, required fault, or restart was not observed.",
      assertions: [],
    };
  }
  const count = snapshot.bookings.filter((b) => b.intentId === INTENT).length;
  const assertions: Assertion[] =
    scenario === "draft"
      ? [
          {
            id: "draft-survives",
            description: "Saved draft remains readable",
            expected: DRAFT,
            actual: observations.draft ?? null,
            passed: observations.draft === DRAFT,
          },
        ]
      : [
          {
            id: "exactly-one-booking",
            description:
              "One user intent produces exactly one committed booking",
            expected: 1,
            actual: count,
            passed: count === 1,
          },
          {
            id: "confirmation-visible",
            description: "The client displays a confirmed booking",
            expected: true,
            actual: observations.confirmed ?? null,
            passed: observations.confirmed === true,
          },
        ];
  const passed = assertions.every((a) => a.passed);
  return {
    verdict: passed ? "PASS" : "FAIL",
    reason: passed
      ? "All declared invariants held in this experiment."
      : "A declared business invariant was violated.",
    assertions,
  };
}
