# Security model

## Trust boundaries and assets

Untrusted browser input crosses the Fastify API boundary before it reaches SQLite. The protected assets are account credentials, revocable sessions, CSRF proofs, per-user game data, setup state, and the availability of the self-hosted instance. The container boundary separates the application from the host; `/data` is the only persistent writable path.

Expected actors are an unauthenticated visitor, an authenticated account, the initial administrator, the deployment operator, and an attacker able to submit arbitrary HTTP requests. Playiku has no external integrations, analytics, uploads, archives, webhooks, redirects, or server-side egress features.

## Controls

- ASVS v5.0.0 V2/V3: Argon2id at 19 MiB, two iterations, one lane; generic failures; IP rate limiting; 30-minute idle and seven-day absolute session expiry; server-side revocation; `HttpOnly`, `SameSite=Strict`, secure `__Host-` cookies outside local development; CSRF proof on every mutation.
- ASVS v5.0.0 V4: every data query is scoped by the authenticated account ID; routes fail closed.
- ASVS v5.0.0 V5: Zod schemas, strict game identifiers, a 64-KiB game-state ceiling, prepared SQLite statements, and a global body limit.
- ASVS v5.0.0 V7: security events record actor, result, request ID, and time without secret values; cookies, authorization data, passwords, and setup secrets are redacted from logs.
- ASVS v5.0.0 V8/V13/V14: no third-party telemetry, strict CSP and security headers, no permissive CORS, no token browser storage, a distroless non-root runtime, read-only root, dropped capabilities, pinned bases/actions, SBOM, provenance workflow, npm audit, and runtime image CVE scan.

## Recovery and residual risk

The setup secret remains present in the container environment and process memory while configured, but setup closes permanently after the first account. Operators should remove it from Compose immediately afterward; a secret-file mount is documented as the safer alternative. Game scores are user-facing data and are not treated as security-authoritative; payload validation and bounds protect storage availability. Account recovery and MFA are not part of version 0.1.0 and require a future product/security decision.
