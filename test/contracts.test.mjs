import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, INTENT } from "../dist/model.js";
const event = (source, kind) => ({
  source,
  kind,
  detail: {},
  seq: 0,
  elapsedMs: 0,
});
test("a relaunch marker without an ordered interruption cannot prove resilience", () => {
  const snapshot = {
    bookings: [{ id: "one", intentId: INTENT, operationKey: "key" }],
    observations: { completed: true, confirmed: true },
    faultActivated: true,
    events: [
      event("driver", "app.started"),
      event("driver", "app.relaunched"),
      event("fixture", "fault.activated"),
    ],
  };
  assert.equal(evaluate("booking", "fixed", snapshot).verdict, "INCONCLUSIVE");
  snapshot.events = [
    event("driver", "app.started"),
    event("fixture", "fault.activated"),
    event("driver", "app.terminated"),
    event("driver", "app.relaunched"),
  ];
  assert.equal(evaluate("booking", "fixed", snapshot).verdict, "PASS");
  snapshot.observations.completed = "true";
  assert.equal(evaluate("booking", "fixed", snapshot).verdict, "INCONCLUSIVE");
});
