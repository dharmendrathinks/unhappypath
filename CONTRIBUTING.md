# Contributing

Useful contributions make a failure easier to reproduce or a verdict harder to fake.

1. Describe the user intent and observable invariant.
2. Add a healthy baseline, a known-broken implementation and a fix.
3. Keep assertions identical across versions.
4. Distinguish application failure from navigation, infrastructure and unsupported behavior.
5. Use synthetic data and bounded, app-scoped faults. Do not affect host networking.
6. Add a meaningful regression test and document platform limits.
7. Run `npm run check`. For native changes, run `npm run ios:prepare` and the affected
   native matrix. Include the environment and redacted evidence in the PR.

The public API is experimental in 0.1. Prefer small adapters and reusable cases before
adding a new engine or service. A passing portable test is not evidence for iOS.

Do not submit raw `.xctestrun`, `.xcresult`, app data, tokens or private screenshots.
Export allowlisted artifacts and review them before attaching. Respect upstream
maintainers; a generated report is a hypothesis until you reproduce the relevant defect.

Be specific and respectful in reviews. Explain disagreements using behavior and evidence.
