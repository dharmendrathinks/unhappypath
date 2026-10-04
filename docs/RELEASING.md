# Preparing an open-source release

The repository is ready for a public release when its recorded
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

The repository is hosted at [dharmendrathinks/unhappypath](https://github.com/dharmendrathinks/unhappypath).
The owner has authorized public visibility. Release preparation does not itself
authorize future visibility changes.
Description, topics, license and contribution links are supplied. Enable private
vulnerability reporting when the host supports it. Record actual remote CI results
in [VERIFICATION.md](VERIFICATION.md); configured workflows alone are not evidence
of a successful run.

No publishing credentials or automatic publication workflow are included. GitHub
visibility changes, GitHub releases and npm publication are separate actions from
pushing the source to the repository.

## Versioned GitHub release

Release `v0.1.0` is a regular GitHub release of package version `0.1.0`. Publish an
annotated tag at the reviewed commit, verify the tag matches the source archive,
and attach the npm-format tarball, source archive and SHA-256 checksums. Release
notes must state the supported contracts, tests actually executed and known limits.
A regular release does not imply arbitrary-app or physical-device coverage.

Keep npm registry publication separate: no package-name ownership or registry
publication is implied by a GitHub release. Exclude private application sources,
local adapters, test credentials and raw run artifacts from every attachment.
