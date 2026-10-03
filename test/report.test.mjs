import { test } from "node:test";
import assert from "node:assert/strict";
import { renderRun, renderSummary } from "../dist/report.js";
import { scenarios } from "../dist/model.js";
test("source strings cannot introduce executable markup into reports", () => {
  const hostile = "<img src=x onerror=alert(1)><script>alert(2)</script>";
  const run = {
    id: "safe",
    scenario: { ...scenarios.booking, title: hostile },
    driver: hostile,
    variant: "fixed",
    verdict: "INCONCLUSIVE",
    reason: hostile,
    startedAt: hostile,
    durationMs: 1,
    artifacts: [],
    assertions: [],
    limitations: [hostile],
    evidence: {
      bookings: [],
      faultActivated: false,
      events: [
        {
          source: "driver",
          kind: hostile,
          elapsedMs: 1,
          detail: { value: hostile },
        },
      ],
    },
  };
  for (const html of [renderRun(run), renderSummary([run])]) {
    assert.equal(html.includes(hostile), false);
    assert.ok(html.includes("&lt;img"));
  }
});
