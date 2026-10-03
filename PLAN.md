# First public release

Build an API-key-free, local lab for three observable failure contracts:

1. A booking committed before a lost response must not duplicate after restart/retry.
2. A draft acknowledged as saved must survive termination and relaunch.
3. A recommendations outage must not block the core booking journey.

Deliverables: a typed runner and driver interface; isolated HTTP fixture with persisted ledger;
portable process driver for fast verification; a SwiftUI iOS app and XCTest driver; unchanged
assertions across baseline/broken/fixed runs; HTML/JSON/Markdown evidence; repeatable replay;
local report viewing; CI and packaging checks; MIT license, contribution/security guidance,
architecture, integration contract, limitations and recorded release verification.

Native runs use a disposable simulator and synthetic accounts. Local reports require no server
or analytics. The CLI may serve reports on loopback for video playback. No hosted service,
model dependency, global installation, automatic publishing or private-app copying.

Release gates: checks green; all healthy and fixed controls pass; deliberately broken versions
fail the intended assertion; native fault activation and actual app restart observed; report
visually inspected; package inspected for secrets/private artifacts; PR Ready analyzer passes.
External-adopter validation and physical-device/Android support remain explicitly future work.
