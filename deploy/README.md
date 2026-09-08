# Deployment files

The checked-in files are reusable deployment code and examples. Real account settings and operator notes stay local.

| File | Purpose |
| --- | --- |
| `production.example.json` | Blank configuration template; contains no real account or resource IDs |
| `aws.mjs` | AWS CLI wrapper that verifies the configured account before dispatching |
| `aws.test.mjs` | Isolated account-guard tests using a mock AWS CLI |
| `crossfire-*.service` | systemd service definitions for the game, tunnel, and discovery |
| `crossfire-hardening.conf` | Additional systemd restrictions |

`production.json` and `*.local.md` are ignored by Git and excluded from Vercel uploads. The account guard requires a populated local `production.json` and stops before contacting AWS if it is missing or invalid. Tests use fictional fixtures and do not require this file or an AWS login.

For a new installation, copy the example only if you do not already have a verified local configuration. Fill in your organization, 12-digit AWS account ID, profile, region, resource IDs, and public origins. Keep credentials in protected runtime configuration; do not add them to this JSON file. See [hosting and operations](../docs/hosting.md).

Ignoring a previously tracked file does not erase it from older commits. Historical configuration identifiers are still present in this repository's history; no credentials were found in the release scan. If a credential is ever committed, revoke or rotate it and assess history cleanup separately.
