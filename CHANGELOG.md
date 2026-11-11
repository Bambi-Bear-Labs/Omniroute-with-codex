# Changelog

## 0.1.0 - 2026-11-11

Initial public-ready release.

### Added

- Narrow normalization for Grok's handling of standalone Codex app-context records.
- Loopback forwarding and streaming response pass-through.
- Explicit opt-in for custom Grok combo aliases.
- Current-user Windows sign-in task with a supervised, recoverable worker.
- Configuration, diagnostic, scoped uninstall and recovery guides.
- Mock tests, Windows script checks and a public-safety scan.

### Operational notes

OmniRoute remains a separate running dependency. Credentials, private catalogs and routing/account exports are not bundled. Destination-machine installation and reboot acceptance must be verified separately from automated tests.
