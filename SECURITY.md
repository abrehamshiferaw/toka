# Security and Privacy Policy

## Reporting Vulnerabilities

If you discover a security vulnerability in Toka, please report it privately rather than opening a public issue.

Send reports to: **algorazplc@gmail.com** or open a private vulnerability report via GitHub Security Advisories.

We review all security reports promptly and aim to release patches for confirmed issues within 48 hours.

---

## Sensitive Content Protection in Toka

Toka is designed to be safe for enterprise and coding-agent workloads:

1. **Automatic Sensitive Content Detection**:
   Toka automatically inspects prompt and message content for high-risk credentials and secrets, including:
   - OpenAI, GitHub, AWS, and Cloud provider API keys
   - RSA/EC private keys (`-----BEGIN PRIVATE KEY-----`)
   - Bearer authentication tokens
   - Password fields and secrets

2. **Cache Bypass**:
   When sensitive credentials are detected or when `sensitive: true` is explicitly passed in request options or metadata, caching is completely bypassed. Sensitive data is never saved into Redis or in-memory cache stores.

3. **Hashed Cache Keys**:
   Cache keys are generated using cryptographically secure SHA-256 digests over canonicalized request payloads. Raw prompt text is never exposed in cache keys.

4. **Zero Silent Downgrading**:
   Toka's routing and budget controls are 100% transparent. All model alterations, fallbacks, and approvals require explicit explanation attached to every `SDKResponse` and `UsageEvent`.

5. **Local-First & Isolated**:
   By default, Toka does not transmit telemetry to any third party. Structured logs and OpenTelemetry spans remain within your own monitoring infrastructure.
