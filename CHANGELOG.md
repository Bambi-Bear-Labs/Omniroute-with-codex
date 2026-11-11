# Changelog

## 0.2.1 - 2026-11-11

### Fixed

- Normalized all standalone `function_call_output` items without `call_id` (including `browser_tabs`, `codex_apps_open_page`, and ambient UI state).
- Prevents HTTP 422 `missing field call_id` errors when browser context or tools are invoked during multi-turn chats.
- Bumped normalization revision to 3.


## 0.2.0 - 2026-11-11

### Added

- Agent-readable `AGENTS.md`, detailed installation guide, and machine-readable install manifest.
- Read-only JSON doctor and bounded model discovery without printing credentials.
- Preview-first setup with explicit Windows bridge installation/reuse and separate CLI-profile or desktop configuration modes.
- Local backups, idempotent application, ownership checks, concurrency guards, and conservative rollback.
- An opt-in three-request synthetic tool-continuation smoke test with explicit quota disclosure.
- Isolated tests for configuration preservation, unsafe paths, conflicts, rollback and task decisions.

### Compatibility

The revision 2 web-search continuation repair remains included. The installer does not start OmniRoute, restore provider accounts, or claim that a particular desktop/reboot workflow is verified by mock tests.

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
