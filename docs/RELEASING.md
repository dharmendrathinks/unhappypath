# Preparing an open-source release

The repository is ready for a public developer-preview release when its recorded
checks pass and the supported scope is accurately described. External adoption,
physical-device coverage and general production suitability are separate claims.

## Local release checks

```sh
npm ci --ignore-scripts
npm run check
npx playwright install chromium
npm run test:report
npm run demo -- --out runs/release-portable
npm run ios:prepare
npm run ios:demo -- --out runs/release-native
npm pack --dry-run
```

Use a new output path for reruns. Verify the nine native cases: baseline PASS,
broken FAIL, fixed PASS for booking, draft and dependency. Inspect a native recording
and final app screenshot as well as the result JSON. Keep an initial failing harness
run in local history; do not relabel it as a product defect or successful validation.

Run the repository readiness check, inspect `git diff --check`, and inspect the
archive file list. It must exclude `.env`, `.cache`, `runs`, test credentials,
XCTest plans, private application material, local absolute paths and signing data.
The package intentionally includes compiled CLI code and reference app sources.

## Release artifacts

- Source archive from the reviewed Git commit.
- npm-format package from `npm pack`; this can be installed from a local tarball.
- Optional reference evidence exported with `unhappypath export` or
  `node scripts/export-suite.mjs runs/release-native .cache/share-native`.
- The version, verified environments, tests actually executed, and known limits.

The unscoped npm name is only a local package identifier; registry-name availability
and publisher access are not assumed. Publishing on GitHub does not require npm
publication. If a registry release is desired, confirm the available package name
and ownership, update metadata and regenerate the lockfile before publishing.

Before creating the public repository, set its description, MIT license, topics,
and contribution/security links. Enable private vulnerability reporting if the
host supports it. CI is configured but cannot be claimed to have run remotely
until the repository is pushed and those runs complete.

No publishing credentials or automatic publication workflow are included. The
source and artifacts can be prepared entirely locally. Actual upload/publishing
is a separate action from this readiness process.
