# Contract: Identity verification (Authentik-originated assertion)

How the app decides an identity assertion "genuinely originates from the deployment's Authentik instance" (FR-004), and the interface test doubles must honor. Mechanism rationale: research R1.

## Assertion transport

- The assertion is the raw value of the `X-authentik-jwt` request header on `/oauth/authorize` (GET and POST). The real Authentik proxy outpost sets it to the session's access token and overwrites any client-supplied value; requests that bypass the outpost may carry anything, which is why the header is never trusted bare.
- Other `X-authentik-*` headers (username, email, uid, meta-jwks) are ignored for all security and display decisions.

## Verifier interface (implemented in `src/server/mcp/auth/identity.ts`)

```ts
interface VerifiedIdentity {
  username: string; // preferred_username from the userinfo response
}

interface IdentityVerifier {
  /** Resolves to the identity iff the assertion is genuinely Authentik-originated and currently valid; null in every other case. Never throws. */
  verify(assertion: string | undefined): Promise<VerifiedIdentity | null>;
}
```

`buildApp` receives an `IdentityVerifier` (production: constructed from `AUTHENTIK_USERINFO_URL`; tests: constructed the same way against a stub userinfo server, so the production code path is what runs). An app with no verifier configured treats every assertion as invalid (fail closed).

## Verification semantics (production implementation)

1. `assertion` absent/empty ⇒ `null` (no network call).
2. Otherwise send `GET <AUTHENTIK_USERINFO_URL>` with header `Authorization: Bearer <assertion>` and a hard timeout (5 s).
3. Result is a `VerifiedIdentity` iff: HTTP status is `200` ∧ body parses as JSON ∧ `preferred_username` is a non-empty string. The username is taken from that response.
4. Every other outcome ⇒ `null`: non-200 (expired/revoked/foreign/malformed tokens — Authentik answers 401/403), network error, timeout, non-JSON body, missing/empty claim. The caller cannot distinguish failure kinds and must not try — one rejection path (FR-004: forged ≡ expired ≡ malformed ≡ foreign ≡ absent).

## Trust anchor

The only trusted input is the operator-configured `AUTHENTIK_USERINFO_URL` (the deployment's Authentik, e.g. `http://<authentik-container>:9000/application/o/userinfo/` on the shared Docker network). URLs arriving in request headers (e.g. `X-authentik-meta-jwks`) are never used. Only the deployment's Authentik can answer its own userinfo endpoint for tokens it minted, so a `200 + preferred_username` is proof of origin; no signature verification happens in the app (authentik proxy providers have no published signing key — research R1).

## Simulation contract (tests and `scripts/outpost-sim.ts`)

A stub identity provider is faithful iff it: accepts `GET` with `Authorization: Bearer <token>`; answers `200` + JSON `{ "preferred_username": "<name>", ... }` for tokens it currently honors; answers `401` for everything else (unknown, expired-by-test, revoked-by-test); and lets tests mint and invalidate tokens. Integration tests forge the outpost by attaching `X-authentik-jwt` to authorize requests; forged-assertion tests attach tokens the stub does not honor, or bypass headers entirely — both must end in the `403` rejection of [oauth-http.md](./oauth-http.md).

## Explicitly rejected inputs (US2 acceptance map)

| Attack | Outcome |
|---|---|
| direct-to-app request with fabricated `X-authentik-jwt` | userinfo answers non-200 ⇒ `null` ⇒ 403, no code |
| direct-to-app request with `X-authentik-username: tyler` and no JWT header | assertion absent ⇒ `null` ⇒ 403, no code |
| expired or revoked real token | userinfo answers 401 ⇒ `null` ⇒ 403, no code |
| token minted by a different (attacker-run) Authentik | deployment's userinfo doesn't recognize it ⇒ `null` ⇒ 403, no code |
| deployment misconfigured with no verifier/URL | every assertion ⇒ `null` ⇒ 403, no code — never a password fallback |
