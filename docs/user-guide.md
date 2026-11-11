# Complete user guide

[Documentation home](README.md) · [Project overview](../README.md)

This guide takes a new Windows user from an existing OmniRoute connection to a verified Codex response. Commands shown here are for one-time setup or diagnostics, not daily startup.

## Before you begin

You need:

- Codex installed and launched once.
- A supported Node.js LTS release, version 22+.
- OmniRoute installed and running on port `20128`.
- Provider accounts you are authorized to use, connected inside OmniRoute.
- An OmniRoute API key and a model ID exposed by your server.

**Do not confuse the components:** OmniRoute is the gateway. This project is a small local compatibility bridge in front of that gateway. Its automatic task does not start OmniRoute.

## Step 1: confirm the original connection

1. Start OmniRoute using your existing installation.
2. Open `http://localhost:20128` in a browser.
3. Confirm your providers are connected in the dashboard.
4. Obtain an API key from OmniRoute's API-key management page.
5. Verify that the model you intend to use is available.

An API address ending in `/v1` is not a dashboard. An unauthenticated browser request may return `Authentication required`; do not disable authentication to remove that message.

If the direct server is offline, fix that before installing the bridge.

## Step 2: download and install the bridge

Download this repository's ZIP and extract it, or clone it. Open the project root and review its scripts.

Double-click `Install-Bridge.cmd`, or run:

```powershell
& .\Install-Bridge.cmd
```

For a custom Grok-only combo during a new install:

```powershell
& .\Install-Bridge.cmd -GrokAliases 'my-grok-combo'
```

Wait for the success message. The helper is installed under your local app-data folder; it will not depend on the extracted ZIP remaining in Downloads.

If the installer says the task already exists, do not create a second task. [Reuse or repair the existing helper](recovery.md).

## Step 3: store the OmniRoute API key

Use the masked prompt in [the configuration guide](configuration.md#api-key). It creates the user environment variable `OMNIROUTE_API_KEY` without putting a visible key in the command itself.

Never use a provider password, session cookie, or OAuth token in place of an OmniRoute key. Do not include the key in screenshots, issues, Git commits, or browser URLs.

After setting a user environment variable, a fresh application/session must inherit it. A one-time sign-out/sign-in or reboot after setup is the simplest acceptance check.

## Step 4: configure Codex

Fully quit Codex before editing. Open its configuration:

```powershell
notepad (Join-Path $env:USERPROFILE '.codex\config.toml')
```

Back up the file. Merge the [example provider configuration](../examples/codex.config.toml) rather than replacing unrelated settings.

- `model_provider` and `model` are top-level keys, before any `[table]`.
- The provider URL is `http://127.0.0.1:20129/v1`.
- `env_key` is the variable name `OMNIROUTE_API_KEY`, never the actual key.
- Keep `wire_api = "responses"`.
- Merge `x-omniroute-no-memory = "true"` into the provider's headers.
- Preserve working authentication choices and your preferred default model.
- Do not duplicate an existing provider table or top-level key.

Use `Show-ConfigSnippet.cmd` for a display-only snippet with your user path. A catalog is optional: add `model_catalog_json` only after creating the catalog file.

## Step 5: optionally organize the model picker

If you already have a custom catalog, preserve its models and metadata. Merge new entries instead of replacing it with the small example.

For a new catalog, use [models and combos](models-and-combos.md). A catalog changes what Codex advertises; it does not create server-side accounts, combo routes, or model entitlements.

## Step 6: validate before daily use

From the project root:

```powershell
& .\Test-Bridge.cmd
```

Expected checks:

- Bridge health identifies `codex-grok-context-bridge-v1`.
- The permanent helper directory and a PID are reported.
- Authenticated direct and bridged model discovery both work.
- The requested test model is available on your server.

Then send a small real request, which may consume quota:

```powershell
& .\Test-Bridge.cmd -TestGrok -Model 'grok-cli/grok-4.7'
```

Use an ID actually available in your installation. Reopen Codex and ask a normal question. Validate visible replies from Grok and a different provider, not just connection badges or pings.

## Step 7: verify after a laptop reboot

Follow the [reboot acceptance checklist](setup-windows.md#reboot-acceptance-checklist).

1. Restart Windows and sign in.
2. The bridge task should start without a manual script.
3. Make sure OmniRoute itself is running.
4. Open Codex and test a response.

If you manually start OmniRoute in a terminal, keep doing that unless its own startup has been configured separately. Automating the bridge does not automate the gateway.

## Day-to-day use

| Action | What is required |
| --- | --- |
| Open Codex | OmniRoute and the managed bridge must be running. |
| Restart only Codex | Normally no bridge command is needed. |
| Restart Windows | Bridge task starts at sign-in; ensure OmniRoute is also started. |
| Change the default model | Select a route available on your OmniRoute server. |
| Edit a startup-loaded model catalog | Fully restart Codex to reload it. |
| Change aliases or repair the helper | Follow the scoped recovery process, not a second task installation. |

## Check the Windows task

```powershell
$task = 'Codex Grok Bridge - ' + $env:USERNAME
Get-ScheduledTask -TaskName $task |
  Select-Object TaskName, State
```

The task should remain Running because the supervisor stays alive. In Task Scheduler, enable **Show Hidden Tasks** if the task is not listed.

Inspect `%LOCALAPPDATA%\CodexGrokBridge\managed-startup.log` and `bridge.stderr.log` when startup fails. Redact usernames, account identifiers, prompts, and keys before sharing diagnostics.

## Safe emergency fallback

If direct OmniRoute works but the bridge does not:

1. Close Codex and back up its config.
2. Temporarily set only the provider URL to `http://localhost:20128/v1`.
3. Reopen Codex to restore the direct route for other models.
4. Diagnose the bridge before putting the compatibility URL back.

The direct route may still produce Grok's original context-format error. [Recovery](recovery.md) explains the difference and scoped removal of the helper task.

## Where to go next

- [Configuration](configuration.md): keys, TOML, headers, and catalogs.
- [Models and combos](models-and-combos.md): available IDs, ordering, and aliases.
- [Troubleshooting](troubleshooting.md): common errors and safe checks.
- [Recovery](recovery.md): Codex-only reinstall, new laptop, and rollback.
