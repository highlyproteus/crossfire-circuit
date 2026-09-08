# Project ownership

Crossfire Circuit belongs to **Proteus Labs**. Hive3 is a separate company with its own production services. Never deploy this game, its credentials, backups, or supporting services into Hive3 infrastructure or reuse another company's resources.

Production AWS ownership and host identity are recorded in the ignored local `deploy/production.json`; private provider/project details are in `deploy/operations.local.md`. Never commit these files or replace their verified values with the public example. Use `node deploy/aws.mjs` for AWS operations: it checks the signed-in account before dispatching a command. Stop on missing configuration or an ownership mismatch instead of selecting another available account or host. Use the existing Proteus Vercel and Crossfire Convex projects in the local operator notes; `docs/hosting.md` is a generic deployment guide.

Keep secrets in server-side configuration, outside Git and browser builds. Archive and verify the exact deployed game before destructive cleanup. Preserve unrelated services. A migration is complete only after public endpoint discovery and multiplayer connectivity pass on the destination and the game is removed from the source.

# Repository hygiene

Keep screenshots, test reports, recordings, and generation logs in ignored `output/` or `work/` directories. Commit repeatable tests and source artwork, not generated test evidence. Runtime models and audio belong in `public/`; editable models and approved concept art belong in `source-assets/`.
