# Evidence: mail sign-in tenant authority fix

Bug: `npm run mail:signin` printed `To sign in, go to undefined and enter the code: undefined` followed by `post_request_failed: invalid_grant`. Root cause: `graph-auth.ts` hardcoded the `/common` MSAL authority, which Microsoft rejects for single-tenant app registrations (AADSTS50059) — and msal-node destructures the error body without checking it, so the real error was swallowed.

## Live end-to-end run (2026-08-11, real tenant)

Reproduction of the failure, direct against Microsoft's endpoint with a valid single-tenant client id at `/common` (client/tenant GUIDs redacted):

```
$ curl -s -X POST "https://login.microsoftonline.com/common/oauth2/v2.0/devicecode" --data-urlencode "client_id=<client-id>" --data-urlencode "scope=Mail.Read offline_access"
{"error":"invalid_request","error_description":"AADSTS50059: No tenant-identifying information found in either the request or implied by any provided credentials. ..."}
```

Same request against the tenant-specific endpoint succeeds:

```
$ curl -s -X POST "https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/devicecode" --data-urlencode "client_id=<client-id>" --data-urlencode "scope=Mail.Read offline_access"
{"user_code":"EWGDFA2LR","device_code":"...","verification_uri":"https://login.microsoft.com/device","expires_in":900,...}
```

Fixed script, run with real `MS_CLIENT_ID` + `MS_TENANT_ID` (process killed after the code printed; the unused device code expires on its own — no sign-in was completed and no token cache was written to the repo):

```
$ MS_CLIENT_ID=<client-id> MS_TENANT_ID=<tenant-id> npm run mail:signin

> work-helper@0.1.0 mail:signin
> tsx scripts/mail-signin.ts

To sign in, go to https://login.microsoft.com/device and enter the code: AJR2SLYD3
```

## Automated checks (run in the feature worktree, confirmed independently by the verifier agent)

- `npm test` — 57 files, 604 tests passed, including new unit tests: tenant-specific authority assertion, descriptive rejection (no `undefined` shown, `onCode` not invoked) when the device-code response carries no code, and `validateEnv` requiring `MS_TENANT_ID` whenever `MS_CLIENT_ID` is set in production.
- `npm run lint` — clean.
- `npm run typecheck` — clean.
- `npm run build` — succeeds.
- Missing-variable guards executed live by the verifier: each of `MS_CLIENT_ID` / `MS_TENANT_ID` absent produces its own clear error and exit code 1 from `scripts/mail-signin.ts`.
