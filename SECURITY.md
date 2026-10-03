# Security and data handling

UnhappyPath is a local development tool for trusted synthetic fixtures. It is not
an isolation boundary for malicious applications, drivers or repository build scripts.
Run code from repositories you trust.

- Fixture servers bind to IPv4 loopback, choose an ephemeral port and require a
  random per-run capability. Browser Origin requests are rejected; CORS is not enabled.
- The control and application routes share the capability. A malicious app can forge
  observations. This design is for engineering tests, not adversarial certification.
- Native test plans contain that ephemeral capability and absolute build paths. Raw
  logs/result bundles may contain them too. Keep `runs/` and `.cache/` private.
- Reports contain synthetic state and screen recordings. Your own adapters can emit
  private data; the exporter is an artifact allowlist, not a universal secret detector.
- The local report server serves a selected directory on loopback with no write API.
  Do not reverse-proxy it onto a public network.
- The lab does not change host networking, run real payments, use cloud credentials,
  contact analytics services or call an LLM.
- Only native devices created by the current run are cleaned up. SIGKILL/power loss
  can bypass cleanup; inspect named disposable devices before targeted removal.
- Artifact hashes detect changes relative to the manifest, not malicious rewriting
  of both the manifest and files.

For a vulnerability report, use the repository host's private vulnerability-reporting
feature when enabled. Until a private channel is available, open an issue asking for
one without including credentials, private artifacts or exploit details. Do not send
private application data in an ordinary issue.

Supported release line: 0.1.x. There is no production-support or security-audit claim.
