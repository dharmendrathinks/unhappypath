# Release verification: 0.1.0

Executed locally on 4 October 2026 (Asia/Kolkata; run timestamps use UTC).
These are observed reference experiments, not measurements of an external app.

## Results

| Check | Observed result |
| --- | --- |
| TypeScript build, strict type checking, formatting | Passed |
| Automated Node tests | 14 passed; also passed on Node 22.23.3 |
| Chromium report test | Passed: navigation, timeline filtering, and 390/768/1440px layouts |
| Portable nine-case matrix | Six PASS, three intended FAIL |
| Native iOS nine-case matrix | Six PASS, three intended FAIL |
| Installed tarball in a clean consumer directory | Full portable matrix matched expectations; zero runtime dependencies |
| Native HTML video playback | Loaded and played in Chromium through the loopback report server |
| Report appearance | Desktop and native report screenshots visually inspected |

The native environment was Apple Silicon macOS, Node 26.5.0, Xcode 27.0
(build 27A266a), and iOS Simulator 18.6 (22G86), using a disposable iPhone 16 Pro
for each run. Exact observations, assertions, dates and native source hashes are
in [native-reference-results.json](native-reference-results.json).
The hashes were checked against the source files shipped in this repository.

| Native contract | Baseline | Broken | Fixed | Evidence of the defect |
| --- | --- | --- | --- | --- |
| Booking | PASS | FAIL | PASS | Two backend bookings for one intent, while the app displays confirmation |
| Draft | PASS | FAIL | PASS | Acknowledged text is absent after termination and reopening |
| Optional dependency | PASS | FAIL | PASS | Recommendations failure leaves booking unavailable; no booking is committed |

Every fault case recorded fault activation. Restart scenarios also recorded the
required termination/relaunch sequence. The same business assertions evaluate
all three variants; the matrix command expects the designed defect to remain FAIL.

An earlier native draft run exposed a test-driver selector mistake (a text field
was addressed as a text view). It was retained locally as an inconclusive run,
the selector was corrected, and the full matrix above was run again with the
corrected source. Harness failures are not counted as app defects.

## Reproduce

Follow the commands in [RELEASING.md](RELEASING.md). Choose fresh output directories.
The full native matrix above is retained locally under `runs/native-final`.
Run directories, credentials, recordings and raw XCTest bundles are intentionally
excluded from Git. The README screenshot is from the native broken-booking run.

A reviewed-format share bundle can be produced with:

```sh
node scripts/export-suite.mjs runs/native-final .cache/share-native
```

The export verifies checksums and includes only named report assets. It excludes
raw native logs, test plans, credentials and client state. This allowlist does not
replace reviewing custom adapter data or recordings before sharing.

## Scope of the evidence

These tests establish the three declared reference contracts on the recorded
local environment. They do not establish real-device behavior, Android support,
radio-loss or jetsam behavior, arbitrary-app compatibility, distributed database
recovery, external adoption, or saved engineering time.
No API keys, paid model calls, signing account or cloud backend were used.

## Remote CI verification

On 4 October 2026, [GitHub Actions run 37169391165](https://github.com/dharmendrathinks/unhappypath/actions/runs/37169391165)
passed on commit `b00848f`. Both Ubuntu jobs (Node 22 and 24) passed the build,
14 automated tests, formatting, strict type checking, nine portable reference
experiments and package dry run. The Node 22 job also passed the Chromium report
test. Portable evidence was retained as workflow artifacts. The repository was
private during those runs and was subsequently made public by its owner.


[Native GitHub Actions run 37169418055](https://github.com/dharmendrathinks/unhappypath/actions/runs/37169418055)
also passed on the same commit. The `macos-15` runner built the app, executed all
nine reference experiments on disposable iOS 18.5 simulators, and exported the
`native-reference-evidence` artifact. Each contract produced baseline PASS,
broken FAIL and fixed PASS. The complete matrix took approximately ten minutes.
Workflow artifacts are subject to the repository's retention policy.
