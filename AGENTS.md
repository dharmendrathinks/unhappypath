# UnhappyPath

This is a standalone open-source mobile reliability lab. No model or API key is required.

- Keep fixture evidence, driver observations and verdicts separate.
- A fault that did not activate is inconclusive, never a passed resilience test.
- Preserve scenario assertions across broken/fixed comparisons. Expected failures remain FAIL.
- Bind fixtures to 127.0.0.1 on ephemeral ports. Use synthetic data and per-run credentials.
- Never mutate host networking or a user's existing simulator. Native runs create disposable devices.
- iOS termination is not a simulation of jetsam, radio transitions, or a physical device.
- Do not claim external adoption, device coverage or production readiness from fixture results.
- Run `npm run check`, the portable demo, and `npm run ios:demo` for native changes.
- Keep `.cache/`, `runs/`, tokens, local paths and signing materials out of Git and package exports.
- Publishing is a separate action. Prepare a clean, reviewed release without sending messages.
