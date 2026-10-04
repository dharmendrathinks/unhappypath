# Integrate an application

Version 0.1 exposes three predefined contracts, not an arbitrary test-language
interpreter. A `Driver` is trusted code that connects your app's UI or CLI to one
of those contracts. It can use XCTest, Maestro, Appium, or another runner you already
maintain. There is no model-provider requirement.

Start with the runnable composition example:

```sh
npm run build
node examples/adapter.mjs
```

It wraps the existing portable process driver to demonstrate the library boundary.
It is not a second independent application or a mobile validation claim.

## Driver interface

```ts
interface Driver {
  name: string;
  details: Record<string, string>;
  limitations: string[];
  run(context: DriverContext): Promise<string[]>;
}
```

`context` includes `fixture.url`, `fixture.token`, `fixture.snapshot()`, scenario,
variant, an isolated output directory, and an optional abort signal. `run()` returns
artifact filenames located directly in that directory. Names cannot contain paths.
Capture synthetic evidence only; avoid raw logs containing credentials.

Use `runExperiment({ scenario, variant, driver, output, signal })` to execute the
contract. Return normally when the journey completes even if the product is broken;
the evaluator decides PASS or FAIL. Throw on navigation failures, missing controls,
build failures or unknown state; these become INCONCLUSIVE. Handle `signal` and
always restore/terminate resources you created.

## Fixture API

Every request requires `Authorization: Bearer <fixture.token>`. The server accepts
only loopback connections and rejects browser Origin requests. Do not expose the
capability or control API to production users. Requests are bounded to 16 KiB.

| Endpoint | Use |
| --- | --- |
| `GET /control/config` | Read scenario and variant |
| `GET /control/state` | Read fixture events and ledger for synchronization |
| `POST /control/event` | Driver lifecycle evidence: `app.started`, `app.terminated`, `app.relaunched`, `draft.saved`, `journey.started` |
| `POST /control/observe` | Observations: `completed`, `confirmed`, `draft`, `bookingEnabled` |
| `GET /recommendations` | Optional service, returns 503 during dependency fault cases |
| `POST /bookings` | Body `{"intentId":"one-user-intent"}`; optional `Idempotency-Key` header |

The operation key must persist across client restart in fixed mode. A repeated key
with a different intent returns 409. The same intent with different/missing keys
creates separate records, deliberately exposing the client retry defect. This is
a single-process fixture, not a production idempotency service.

## Adapter responsibilities

1. Build/install only an explicitly chosen test app; use a disposable environment.
2. Point the app at the local fixture using a debug-only base-URL override.
3. Seed one synthetic intent, or the draft `Remember the umbrella.`.
4. Drive real controls and report actual process lifecycle events.
5. In fault cases wait for the backend commit/withhold event before terminating.
6. Relaunch without clearing the app's state. Observe confirmation or draft text.
7. Submit observations and `completed: true`. Never infer completion from a timeout.
8. Capture evidence and clean up in `finally`, including cancellation.

For booking/dependency, the backend counts records belonging to `one-user-intent`.
Draft compares the driver-observed text. To test other domain semantics, implement
an explicit contract extension in `model.ts` with independent known-broken/fixed
cases. Do not coerce unrelated properties into these fields or claim generic coverage.

## Integrating existing services

Your app needs a development backend override or test transport. App-specific
network pinning, CloudKit, StoreKit, encrypted protocols and third-party identity
flows need separate fixtures; they are not automatically intercepted. For real
backend commit semantics, expose a test-only event at the durable commit boundary
and query an independent test ledger. A timeout alone cannot identify that boundary.

## Existing-app validation

The driver interface has also been exercised against one owner-supplied SwiftUI
editor, using a real save/termination/reopen journey and an injected lost-write
negative control. See [the experiment and its limits](EXISTING-APP-VALIDATION.md).
That private application's source and adapter are not distributed here.
