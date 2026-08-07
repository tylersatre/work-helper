# Future: production-cutover

## One-liner

Declare the home-server deployment production: flip the constitution's development-phase data policy to require data-preserving migrations, and add backups for real data.

## Origin

- **Source:** split from `docs/product/features/home-server-deploy.md`
- **Deferred because:** Tyler decided the first home-server deploy still holds test data only — the deploy ships now, the production declaration (and everything that must come with it) waits until he's ready to put real data in
- **Recorded:** 2026-08-07

## Depends on

`home-server-deploy` shipped (there is a deployment to declare production). Realistically also gated on Tyler deciding the app is trustworthy enough for real data.

## Notes

- The constitution (v1.1.0, "Data & migrations (development phase)") and CLAUDE.md both say the no-migrations policy "expires once real data exists (first production deployment or real email ingestion begins)" and must then be amended to require migrations that avoid data loss where possible and flag any unavoidably lossy step. That amendment is the core of this feature — Tyler confirmed in the home-server-deploy interview (2026-08-07) that the first deploy does not trigger it.
- Backups/restore for the deployed volume were explicitly deferred out of home-server-deploy into this stub. Nothing about backup cadence, destination, or restore drills was discussed.
- Note the same trigger fires if real email ingestion begins first (see the `email-ingestion` stub) — whichever comes first should pick this stub up.
