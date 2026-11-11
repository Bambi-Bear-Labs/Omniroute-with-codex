# Changelog

## 0.1.1 - 2026-11-11

### Fixed

- Grok follow-up requests failing after tool/web-search use when replay metadata contains `web_search_call.action.type = "other"`.
- Preserve those markers as explicitly lower-trust reference metadata without altering real tool-call/result pairs or accepted native search actions.
- Report `normalizationVersion: 2` in bridge health so operators can verify the loaded repair.

### Verification

- Added synthetic replay and strict-upstream HTTP regression tests.
- Verified real initial tool call, tool-result continuation, and subsequent follow-up; tested Grok model variants and a configured combo alias.
- No user prompts, credentials or private call logs are included in regression fixtures.

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

### Documentation and usability

- Expanded the project landing page with complete quick-start steps, feature tables, navigation and collapsible troubleshooting.
- Added a beginner user guide, model/combo guide, and documentation index.
- Config snippets keep the optional catalog line commented until its file exists.
