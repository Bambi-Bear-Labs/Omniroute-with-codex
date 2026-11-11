# Models, catalogs and combo aliases

[Documentation home](README.md) · [Configuration](configuration.md)

## Three different concepts

| Concept | Meaning | Where it is configured |
| --- | --- | --- |
| Provider model ID | The route OmniRoute can serve using an authorized connection. | OmniRoute / its providers |
| Combo alias | A user-defined name for server-side routing rules. | OmniRoute combos |
| Codex catalog entry | Metadata advertised in the client model picker. | Optional `model_catalog_json` file |

Adding a catalog entry does not create a model route or combo. Provider access is not granted by a model name.

## Discover your actual IDs

`Test-Bridge.cmd` verifies that direct and bridged discovery agree. To list IDs from PowerShell, without printing the key:

```powershell
$key = $env:OMNIROUTE_API_KEY
if (-not $key) {
  $key = [Environment]::GetEnvironmentVariable('OMNIROUTE_API_KEY', 'User')
}
if (-not $key) { throw 'Set the OmniRoute key as described in the configuration guide.' }
$headers = @{ Authorization = 'Bearer ' + $key }
(Invoke-RestMethod -Uri 'http://localhost:20128/v1/models' `
  -Headers $headers).data | Select-Object id
Remove-Variable key, headers
```

Use IDs returned by your installation. Examples such as `grok-cli/grok-4.7` are not a promise that every account or future server version exposes them.

## Create or extend a client catalog

The complete [example file](../examples/omniroute-models.example.json) contains three illustrative Grok entries. It does not include personal provider credentials, private combo definitions, or a bundled proprietary model-instruction catalog.

- If a catalog already exists, preserve it and merge suitable entries/metadata.
- For a new catalog, follow the copy/generation steps in [configuration](configuration.md#optional-model-catalog).
- Set `model_catalog_json` to a real absolute path for the destination Windows user.
- Restart Codex after changes; the catalog is loaded at startup.
- Keep `slug` equal to a route/alias that your OmniRoute installation can serve.

Do not replace an existing multi-provider catalog with the three-entry example unless that is intentionally what you want.

### Recommended organization

| Group | Suggested order |
| --- | --- |
| Pinned combos | Your most-used aliases first, in your preferred order |
| Gemini | Available newer versions before older versions |
| Chat GPT | Available newer versions before older versions |
| Grok | Available newer versions before older versions |
| Internal entries | Preserve intended hidden status and metadata |

Keep the array order and numeric `priority` values consistent; avoid duplicates. This is an organizational suggestion, not a provider-selection rule enforced by the bridge.

The initial example reasoning choices are low/medium/high/xhigh for Grok 4.7/4.6 and low/medium/high for 4.5. Verify what your server/version supports before adding more choices.

## Use a custom Grok combo

Native IDs beginning `grok-cli/grok-` or `gc/grok-` are recognized automatically. Arbitrary aliases are not, because silently rewriting an unrelated combo would be unsafe.

For a fresh installation:

```powershell
& .\Install-Bridge.cmd -GrokAliases 'my-grok-combo'
```

Create the alias and its routing definitions separately in OmniRoute. For an existing helper, follow the scoped repair/reinstall procedure instead of installing a duplicate task. Keep mixed-provider routing decisions outside this narrow model-name opt-in.

For manual development:

```powershell
$env:OMNIROUTE_CODEX_GROK_ALIASES = 'my-grok-combo,another-grok-combo'
npm start
```

## If a model is missing

1. Confirm it exists in authenticated OmniRoute discovery.
2. Confirm its connection/subscription is authorized and usable.
3. Confirm any combo is defined server-side, with exact spelling/case.
4. Check the catalog's path, `slug`, visibility, and priority.
5. Fully reopen Codex after catalog changes.
6. Test a real visible response, not just model discovery.
