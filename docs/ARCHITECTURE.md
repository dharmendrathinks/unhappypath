# Architecture and trust boundaries

The runner starts one fixture per experiment on an ephemeral IPv4 loopback port.
It passes an ephemeral capability to a trusted driver. The driver controls the
client; the fixture records backend events; the evaluator checks a fixed contract.
Finally, the runner closes the fixture and writes reports plus SHA-256 checksums.

```text
CLI / library
  └─ experiment runner
       ├─ fixture: HTTP API + flushed booking ledger + event sequence
       ├─ driver: separate Node process OR XCTest + disposable simulator
       ├─ evaluator: required evidence → invariant assertions → verdict
       └─ artifacts: JSON + HTML + Markdown + optional video/screenshot
```

## Decisions

- Use Node built-ins and TypeScript. Runtime dependencies: zero.
- Use XCTest directly for the bundled native fixture. A new UI automation engine
  or an autonomous agent is not needed for these three declared journeys.
- Implement commit-aware response withholding in the controlled backend. A TCP
  proxy cannot know that an arbitrary database transaction committed. Toxiproxy
  remains an appropriate integration for transport failures, but is not a required
  dependency for these application-level fixtures.
- Use event barriers rather than fixed sleep durations before interruption. The
  recorder, OS and animation timing are not deterministic; the fault boundary is.
- The server mutates its in-memory index and synchronously flushes a ledger before
  activating the lost-response fault. This serializes this single-process fixture.
  A production idempotency design needs an atomic database transaction, key scope,
  payload matching, expiry policy and concurrent-worker handling.
- Fix behavior only in the client mode; keep the server and assertions identical.
- Render reports from escaped strings with no analytics, CDN assets or external fonts.

## Evidence and verdicts

Backend bookings and fault activation are fixture evidence. UI text and process
lifecycle markers are driver observations. Verdicts are derived analysis. The
fixture control API is trusted instrumentation; this is not a security boundary
against a malicious adapter or app that knows its capability.

PASS means every declared invariant held and necessary evidence was observed.
FAIL means a complete experiment violated an invariant. INCONCLUSIVE means the
journey, fault or restart was not established, or infrastructure failed.
UNSUPPORTED is reserved by the result format for unsupported capabilities.

A killed test runner, missing UI element, inaccessible backend or stale native
build must not be interpreted as a product defect. Partial evidence is retained.

## Artifacts

Each run has a random directory and its own fixture/client state. The run records
Node/platform details and, for native experiments, Xcode/runtime/device information
and source hashes. `fixture.json` contains the ledger, ordered events and
observations. `run.json` adds assertions and limits. Native raw logs and test plans
are private diagnostic artifacts and are excluded by the exporter.

The HTML video includes driver setup. Timeline timestamps are measured from
fixture creation; they are not currently frame-synchronized with video. The
report explicitly states this limitation. The final screenshot comes from an
XCTest attachment taken while the app is visible, not from the home screen after
test teardown.

## Cancellation and isolation

Each native run creates and deletes its own simulator. No global simulator erase,
host-wide firewall change or cloud connection is used. Normal termination and
interruption run cleanup; a machine crash or SIGKILL may leave a clearly named
UnhappyPath simulator. See IOS.md for targeted recovery.
