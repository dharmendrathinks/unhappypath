# Existing-app integration validation

On 4 October 2026, UnhappyPath was exercised against an existing, separately
developed SwiftUI story editor supplied by the repository owner. This was not
the bundled reference app. The application source is private and is not part of
UnhappyPath's MIT-licensed distribution. This is owner-run integration evidence,
not independent adoption or broad application certification.

## Experiment

An app-specific XCTest adapter used the existing public `runExperiment` driver
interface and the unchanged `draft` contract, fixture, evaluator, report renderer
and checksum verifier. It performed real UI interactions:

1. Launch a fresh, isolated test store in a disposable simulator.
2. Create a blank story and rename its draft to synthetic text.
3. Tap Save and wait for the visible save acknowledgement.
4. For interruption cases, terminate the app and confirm it is not running.
5. Relaunch with the same store, reopen the draft, and read its name from the UI.
6. Independently read the saved project metadata from the simulator sandbox and
   confirm that the persisted name matches the UI observation.

The app did not need a new network override: this contract concerns local storage.
The XCTest adapter reported lifecycle events and observations to the loopback
fixture. Driver completion was kept separate from the business assertion.

## Observed results

Environment: Xcode 27.0 (27A266a), iPhone 16 Pro Simulator, iOS 18.6 (22G86).

| Implementation and experiment | Business verdict | Observed outcome |
| --- | --- | --- |
| Original app, ordinary save | PASS | UI and saved metadata contained the intended draft name |
| Original app, save then terminate/reopen | PASS | The intended name survived; lifecycle and fault activation were observed |
| Deliberately broken copy, same interruption | FAIL, expected | The UI acknowledged saving, but reopening recovered the old name; persisted metadata agreed |

The negative control suppressed the renamed draft's metadata write only in an
isolated copy of the app-owned persistence layer. The same UI journey and business
assertion caught the defect. It is an injected defect, not a discovered bug in the
original app. No app fix was necessary. The schema's `fixed` label was used for the
original app's recovery case; its app implementation was identical to the baseline.
All three native XCTest journeys completed, including the intentionally broken
case; the FAIL came from UnhappyPath's business assertion.

## Isolation and evidence

The original application checkout was unchanged. The private SDK's integrity
check passed 1,293 manifest entries. Three ignored metadata files absent from a
Git-only worktree were restored only after matching their frozen hashes. No SDK
code was edited. The deliberately injected mutation was removed afterwards,
and the isolated app was rebuilt from the original persistence source.

Run JSON, screenshots, recordings, native logs, source hashes, the private adapter,
and reproduction instructions are retained locally by the owner under ignored
`runs/` and `.cache/` directories. All three exported evidence manifests passed
checksum verification. Private application material is intentionally absent from
this repository, so an independent contributor cannot reproduce this particular
app run from the open-source checkout alone. The bundled reference matrix remains
the fully included reproduction path.

## What this does and does not establish

This demonstrates a working adapter for one real application's draft-name
persistence flow and a negative control that detects lost data. It does not verify
all editor content, exports, purchases, every app screen, other applications,
physical-device behavior, SIGKILL, jetsam, or radio transitions. XCTest termination
is the documented fault mechanism.

Integration still required app-specific navigation, an isolated data store, and
an observable persisted value. It is not automatic testing of an arbitrary app
folder or an App Store download. No API keys or model calls were needed.
