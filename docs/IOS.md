# Native setup and troubleshooting

1. Install full Xcode and select its developer directory using your normal Xcode setup.
2. Install an iOS 18 or newer Simulator runtime in Xcode Settings → Components.
3. Install XcodeGen from its official distribution (for example `brew install xcodegen`).
4. Install Node 22+ and Python 3, then run `npm ci --ignore-scripts`.
5. Run `npm run ios:prepare`, then `npm run ios:demo`.

The script prefers an available iOS 18 runtime, otherwise the first available iOS
runtime. Set `UP_IOS_RUNTIME` to an exact identifier from `xcrun simctl list runtimes -j`
to choose explicitly. The device type comes from that runtime's supported iPhones.
Native code targets iOS 18.0 or newer.

The app accepts only a loopback HTTP fixture URL. Its transport exception is for
this synthetic development app, not a recommended production network policy.
No Apple account, provisioning profile, physical device or paid device cloud is used.

`ios:prepare` creates a project under `.cache/ios`, builds for Simulator and records
source hashes. A native run refuses to use the build after source changes. Run
prepare again after changing the app, XCTest code or project spec.

The generated `.xctestrun` contains ephemeral fixture credentials and absolute
build paths. Keep it private. Publish only `unhappypath export` output after review.

## Troubleshooting

- Build failure: read `.cache/ios/build.log`; confirm the selected Xcode has an iOS SDK.
- Missing runtime: install it through Xcode. The tool does not download GB-sized runtimes.
- INCONCLUSIVE: read the specific run's `native.log` and `native.xcresult`. An XCTest
  failure is a harness problem until evidence establishes an application invariant violation.
- Stale build: rerun `npm run ios:prepare`.
- Interruption: normal SIGINT/SIGTERM invokes cleanup. After a machine crash, list
  devices with `xcrun simctl list devices`; identify only abandoned `UnhappyPath-*`
  devices and shut down/delete those exact UUIDs. Never erase all simulators.
- Resource usage: nine cases create nine disposable devices sequentially. Xcode
  caches and raw result bundles are ignored; archive wanted evidence before deleting them.

The native test uses visible controls and real local persistence. It intentionally
captures observations even when the business invariant fails; the central evaluator
produces FAIL. XCTest assertions are reserved for navigation and infrastructure.
