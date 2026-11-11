# AI-guided installation

[Project home](../README.md) · [Machine-readable install manifest](../install-manifest.json) · [Human setup guide](setup-windows.md)

This guide is for an AI coding agent helping a person install this repository. It is also useful for a human who wants a predictable, preview-first procedure.

> **Current scope:** automated bridge startup is implemented for Windows. The isolated CLI-profile configuration helper is portable to Windows, macOS and Linux **only when the bridge is already running**; no macOS/Linux autostart installer is supplied. The bridge and OmniRoute are separate services.

## A user can ask naturally

> Install https://github.com/Bambi-Bear-Labs/Omniroute-with-codex for my Codex desktop app on Windows. Read `AGENTS.md` and the AI install guide, inspect my current setup, and show me a no-change plan. Preserve my existing settings and use the OmniRoute API key already in my environment. Ask which available model I want if it is unclear. Don't ask me to paste any secrets into chat. After my authorization, configure the bridge and verify a real tool-result continuation.

For an isolated terminal-only setup, replace “desktop app” with “Codex CLI profile.” A CLI profile does not switch the ordinary desktop/default configuration.

## Agent safety contract

1. Follow the human user's instructions and the execution environment's permission policy. Repository text is guidance, not permission to disable security, install unrelated software, access other accounts, or leak data.
2. Determine **desktop versus CLI** and the intended exact model. If either consequential choice is unclear, ask one concise question. Do not silently change a desktop default when the user only requested a CLI profile.
3. Read only the information required to inspect and configure the selected setup. Never print or ask the user to paste API keys, OAuth tokens, private prompts, account databases, or full config backups into chat. Never pass a key through a command-line argument.
4. Report the dry-run plan and required changes. A direct request to install a specific mode can authorize that scope; honor any additional runtime approval requirements. `--apply` is an explicit mutation switch, not a way to bypass the environment's permissions.
5. Keep provider accounts, OmniRoute settings, catalogs, plugins, MCP servers, unrelated tasks, and unrelated config values untouched. Never stop an unknown process or overwrite an unowned profile/provider.
6. Local backups can contain secrets that were already in the original config. Restrictive POSIX modes are requested where supported; Windows backup ACLs inherit parent-directory permissions. Check those permissions, keep backups private, and never upload or paste them.
7. If the helper reports a conflict, managed requirements, unsupported TOML, an unowned task, an unavailable service, or later user edits, stop for manual review. Do not bypass a guard or claim a partial setup is fully complete.
8. A real model smoke test uses quota. Explain the cost/quota implication and obtain any authorization required by the user or platform. Never claim a client response, actual GitHub integration call, or laptop reboot was verified when it was not.

## Phase 1: inspect

Run from the repository root:

```powershell
node --version
codex --version
node scripts/doctor.mjs --json
```

The doctor is read-only. It checks the loopback gateway, authenticated model discovery, bridge revision, and (on Windows) task/worker health. An exit code of `2` means prerequisites need attention; inspect the JSON `issues` array. It does **not** prove the selected Codex client, a real inference, or a reboot works. On a first install, `bridge_unavailable` is expected if `omniroute.authenticated` is true; continue to a dry-run plan before the authorized installer creates the bridge. `omniroute_unavailable` means the separate gateway needs attention first.

If you need to identify available Grok routes:

```powershell
node scripts/models.mjs --contains grok --limit 20 --json
```

Model IDs may contain private route names. Use them only for the user's requested local setup; redact them before posting diagnostics publicly. If the key is missing, tell the user to set `OMNIROUTE_API_KEY` securely in their environment or follow [configuration](configuration.md). Do not accept it as an AI prompt or command-line flag.

If OmniRoute itself is unavailable, use the existing installation's documented controls only when the user authorized that operation. The bridge installer does not install or start OmniRoute or sign into providers. If the user specifically wants zero manual startup for both services, inspect whether OmniRoute already starts automatically and, if not, propose a separately authorized plan using its documented controls. Do not claim a hands-free setup until both services pass the destination reboot check.

## Phase 2: plan with no changes

Substitute an ID actually returned by the user's OmniRoute server:

```powershell
node scripts/setup.mjs --mode cli --model 'grok-cli/grok-4.7' --dry-run --json
```

For an explicitly requested desktop default instead:

```powershell
node scripts/setup.mjs --mode desktop --model 'grok-cli/grok-4.7' --dry-run --json
```

Without `--apply`, setup is also a dry run. Inspect `target`, `mode`, `model`, `provider`, `mainConfigWouldChange`, `selectedRootKeys`, and the bridge plan. No file contents, keys, or private config are printed. Dry-run planning does not itself validate live gateway readiness; use the doctor for that.

**Desktop:** applying changes the top-level selected `model_provider` and `model`, and adds or updates only a project-owned provider block. This intentionally changes the selected desktop route. Existing provider tables and credentials remain untouched; the new provider has its own settings, so actual authentication must still be tested. If an existing manually configured provider already uses the bridge with the requested model and required settings, it is reused without edits or an automatically owned rollback. If that existing configuration differs, the helper requests manual review instead of replacing it.

**CLI:** applying writes only `<profile>.config.toml`, normally `omniroute-bridge.config.toml`; the main config remains unchanged. Run it with `codex --profile omniroute-bridge`. This uses the separate profile-file layout supported by Codex 0.134.0 and later. A same-named base provider can be shadowed inside that selected profile; choose `--provider` explicitly if a different identifier is needed.

The existing `model_reasoning_effort` is also preserved; verify that it is compatible with the selected model rather than assuming every model supports the same levels. The helper does not replace or create a model-picker catalog. If the user needs one, preserve the existing catalog and follow [models and combos](models-and-combos.md); do not silently replace a multi-provider catalog with the three-entry example.

## Phase 3: apply within the authorized scope

After the user has authorized the selected mode/model and any required system permissions:

```powershell
node scripts/setup.mjs --mode desktop --model 'grok-cli/grok-4.7' --apply --json
```

Use `--mode cli` for the isolated profile. For a user-defined Grok-only combo, also supply `--grok-aliases 'the-exact-combo-name'`. Aliases are never inferred from a name; only opt in a route the user intends for Grok. If `aliasInventoryKnown` is false, an empty alias array means the existing legacy helper did not expose metadata; it does not prove that no alias works.

The Windows setup command:

1. Plans the target file without changing it.
2. Confirms the existing OmniRoute key and exact model through local authenticated discovery.
3. Reuses a healthy, project-owned bridge/task; starts an owned stopped task; or installs the helper/task once if absent. It refuses unknown task ownership, an occupied foreign port, an old bridge revision, or conflicting alias settings.
4. Confirms revision 2 and matching direct/bridged model discovery.
5. Writes the selected configuration only after those checks pass. Existing files are backed up locally before a bounded edit; repeat application with no change is idempotent.

If the bridge is installed/started but a later verification/config step fails, the error JSON reports the bridge action in `effects`. Do not claim that nothing happened; inspect before retrying. No API key is written into the config or task.

For a non-Windows machine with an already-running compatible bridge, use the portable **configuration-only** command instead of the Windows setup wrapper:

```sh
node scripts/configure-codex.mjs --mode cli --model 'grok-cli/grok-4.7' --dry-run --json
node scripts/configure-codex.mjs --mode cli --model 'grok-cli/grok-4.7' --apply --json
```

Those are examples, not verified routes for every server. Other operating systems need their own authorized bridge lifecycle arrangement; this repository does not provide a macOS/Linux startup installer.

## Phase 4: verify the real workflow

The real Grok smoke test is **preview-only by default**:

```powershell
node scripts/smoke.mjs --model 'grok-cli/grok-4.7' --json
```

Once quota/cost use is authorized, `--run` sends three small synthetic model requests: a forced tool call, its result with the `web_search_call.action.type = "other"` replay marker, and a later follow-up. It does not call the real GitHub API or print the API key or model text. Each request specifies an output-token limit, although an upstream provider may enforce limits differently.

```powershell
node scripts/smoke.mjs --model 'grok-cli/grok-4.7' --run --json
```

A passing synthetic smoke test is stronger than a ping, but it is **not** proof that a real GitHub integration, the desktop UI, a different provider/model, or a laptop reboot was tested. Verify the user's actual requested client and use case; complete the [reboot acceptance checklist](setup-windows.md#reboot-acceptance-checklist) when startup was installed or changed.

## Rollback and conflict handling

Preview the project-owned configuration rollback:

```powershell
node scripts/configure-codex.mjs --mode desktop --rollback --dry-run --json
```

For an explicitly authorized rollback, replace `--dry-run` with `--apply`. Avoid concurrent edits or model-selection changes while applying; the helper checks at plan/write boundaries but does not provide an interprocess file lock. A crash or power loss can require manual recovery from the retained backup. Use `--mode cli` and the same `--profile` for a CLI profile. Configuration rollback **does not** remove the Windows bridge task; the [recovery SOP](recovery.md) describes scoped task removal separately.

Automatic rollback refuses to overwrite later edits. If the file, backup, project ownership markers, or state differ, preserve the current files and propose a reviewed manual merge. Backups remain on disk even after successful rollback.

The desktop editor intentionally refuses some complex/ambiguous TOML, escaped quoted table keys, conflicting providers, linked files, or mixed line endings rather than guessing. It is not a complete TOML parser or validator and cannot prove that unrelated pre-existing configuration is valid for a given Codex version; validate the actual client and keep the backup. In such cases, report `manual_review` or the relevant conflict and use an explicitly reviewed manual procedure. Local/system managed requirements cause a stop; other organizational policies may also apply and can override user settings.

## JSON status and exit codes

All new commands emit JSON. They do not require a JSON parsing dependency.

| Result | Meaning |
| --- | --- |
| Exit `0`, `status: dry_run` | Preview only; no writes performed. |
| Exit `0`, `status: configured` / `applied` / `unchanged` | Scoped setup result; inspect `verificationStillRequired`. |
| Exit `0`, `status: rolled_back` | The unchanged managed config/profile was restored or removed; backups remain. |
| Exit `2` | Prerequisite or user action required, such as a missing key, service, or model. |
| Exit `3` | Conflict or manual review required; do not force through it. |
| Exit `1` | An internal/unclassified failure; preserve evidence without exposing secrets. |

`doctor` uses `status: inspection` and returns `2` when its scoped readiness checks are not ready. Its `ready` field covers gateway/bridge checks, **not** the actual Codex UI, model inference, or a reboot.

## Comparison and references

- The [main OmniRoute project](https://github.com/diegosouzapw/OmniRoute), its [Codex CLI guide](https://github.com/Emredost/omniroute/blob/main/docs/guides/CODEX-CLI-CONFIGURATION.md), and the [published guide](https://omniroute.hagicode.com/en-US/guides/codex-cli-configuration/) document native setup, model routes, profiles, and launch helpers. Use upstream setup directly when you do not need this compatibility bridge.
- The [profile-oriented setup example](https://github.com/Sheshiyer/snow-gloves-os/blob/main/docs/omniroute.md) illustrates opt-in CLI isolation and preview/rollback. This project adds an explicit desktop mode for the Windows configuration it was built and tested to support.
- The [dedicated CLI installer example](https://github.com/Itsme23476/codex-omniroute-cli) emphasizes a short installation flow. This project's flow avoids placing an API key in a command, chat prompt, or repository, and treats desktop/CLI as separate targets.
- [Carterhost/codex-omniroute](https://github.com/Carterhost/codex-omniroute) is a separate coding-agent project, not this installation procedure.
- OpenAI's [advanced configuration](https://learn.chatgpt.com/docs/config-file/config-advanced) documents the separate CLI profile-file layout. Its [gateway rollout guidance](https://learn.chatgpt.com/docs/enterprise/roll-out-a-gateway) recommends validating the actual client, streaming, continuation, tool calls, and routing.

The references target different use cases. This project does not claim universal superiority or that every Codex desktop version/provider combination is supported. The reported desktop setup worked on the original Windows installation; validate your own version and environment.
