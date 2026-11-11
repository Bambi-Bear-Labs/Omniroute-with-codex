# Configuration

[Back to README](../README.md)

## Merge rather than replace

Back up `%USERPROFILE%\.codex\config.toml`. Use `examples/codex.config.toml` or `Show-ConfigSnippet.cmd` for a user-specific snippet.

- Top-level keys go before the first TOML `[table]`.
- Update existing keys/tables instead of duplicating them.
- Keep your preferred default model and unrelated headers.
- Keep `wire_api = "responses"`.
- Preserve any working `requires_openai_auth` choice. The generic example omits it rather than forcing OpenAI authentication for a third-party gateway.

Reference: [official OpenAI Configuration Reference](https://learn.chatgpt.com/docs/config-file/config-reference).

## API key

Use an **OmniRoute API key**, not an upstream password/OAuth token:

```powershell
$secret = Read-Host 'OmniRoute API key' -AsSecureString
$key = [System.Net.NetworkCredential]::new('', $secret).Password
[Environment]::SetEnvironmentVariable('OMNIROUTE_API_KEY', $key, 'User')
$env:OMNIROUTE_API_KEY = $key
Remove-Variable key, secret
```

A masked prompt avoids exposing the value in command history. A user environment variable is **not a password vault**. Never commit, print, screenshot or post the key. Sign out/back in or reboot once so new Codex processes inherit it.

## Optional model catalog

`examples/omniroute-models.example.json` is a small generic example, not a personal catalog or model-availability promise. Check IDs against authenticated `/v1/models`.

If an existing catalog contains other providers, merge new entries instead of replacing it with this small example. Use the copy block below only when intentionally starting a new catalog.

From the repository root:

```powershell
$homeCodex = Join-Path $env:USERPROFILE '.codex'
New-Item -ItemType Directory -Force -Path $homeCodex | Out-Null
$catalog = Join-Path $homeCodex 'omniroute-models.json'
if (Test-Path -LiteralPath $catalog) {
  Copy-Item -LiteralPath $catalog -Destination (
    $catalog + '.backup-' + (Get-Date -Format yyyyMMdd-HHmmss))
}
Copy-Item -LiteralPath '.\examples\omniroute-models.example.json' `
  -Destination $catalog
& .\Show-ConfigSnippet.cmd
```

Set `model_catalog_json` to the generated **absolute path**. TOML does not evaluate `%USERPROFILE%` or `$env:USERPROFILE` there. Restart Codex to reload the startup-loaded catalog.

For your own order, keep array order and numeric priorities consistent. A picker entry does not create an OmniRoute route, combo or entitlement. Do not overwrite a machine's entire config with another laptop's plugin/runtime paths.

## Custom combo aliases

`grok-cli/grok-*` and `gc/grok-*` are recognized automatically. Other names are untouched unless opted in.

For a new install:

```powershell
& .\Install-Bridge.cmd -GrokAliases 'my-grok-combo'
```

The alias is recorded in helper `runtime.json` (not a secret store). Recreate routing definitions separately in OmniRoute.

For manual development:

```powershell
$env:OMNIROUTE_CODEX_GROK_ALIASES = 'my-grok-combo,another-grok-combo'
npm start
```

Only opt in aliases intended for Grok. Mixed-provider combos may need provider-specific routing outside this helper.

## Memory opt-out

```toml
http_headers = { "x-omniroute-no-memory" = "true" }
```

This prevents OmniRoute memory/skill injection for this provider; it does not disable Codex's own memory. It addresses a separate tool-schema error from the missing-call-ID context issue.
