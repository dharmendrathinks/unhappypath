# Prior art and scope

Checked October 3, 2026. Documentation claims are not hands-on comparative results.
UnhappyPath does not invent chaos testing, retry testing or test reports.

- [Maestro](https://docs.maestro.dev/reference/commands-available/killapp.md) already
  documents process interruption and persistence tests. Existing flows can drive an adapter.
- [Toxiproxy](https://github.com/Shopify/toxiproxy) is an established MIT-licensed
  programmable TCP proxy. Use it for transport-level fault integrations; this lab's
  first response fault is application-aware and runs in a controlled fixture.
- [Chaos](https://github.com/Ednk-1312/Chaos) provides macOS fault plans, replay,
  assertions, cleanup and reports. A timeline viewer is not novel by itself.
- [simctl-mcp](https://github.com/Reezxy/simctl-mcp) supplies iOS interaction and
  mock-backend testing; [monkeyrun](https://github.com/ameyanatu/monkeyrun) offers
  gesture testing, crash evidence and replay.
- [Momentic Mo](https://momentic.ai/mo) advertises mobile exploration with recordings
  and reproduction steps. [TestingBot](https://testingbot.com/support/app-automate/maestro/options)
  documents managed network presets.
- [Uber's mobile chaos testing paper](https://arxiv.org/abs/2602.06223), submitted
  February 5 and revised July 8, 2026, reports business-flow failures under backend
  faults. Its enterprise results are not evidence of demand for this small-team tool.
- [PocketShell issue 552](https://github.com/PocketShell-io/pocketshell/issues/552),
  June 2026, documents an application-specific Toxiproxy harness and remaining
  resilience failures. Competent composition of existing tools may be sufficient.

This project's current contribution is an approachable, inspectable reference lab:
unchanged business invariants, commit-aware interruption, independent ledger checks,
before/after implementations and native recordings. Whether the integration API
saves time across external apps remains to be measured.

No third-party source code is copied into the implementation. Development dependencies
retain their own licenses. Xcode, the Simulator, XCTest and SF Symbols are Apple tooling;
the MIT license applies to this repository's authored code, not those Apple components.
