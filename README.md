<p align="center"><img src="assets/banner.svg" alt="OmniRoute with Codex by BambiBear Labs" width="100%" /></p>
<p align="center">
<a href="https://github.com/Bambi-Bear-Labs/Omniroute-with-codex/actions/workflows/ci.yml"><img alt="Tests" src="https://github.com/Bambi-Bear-Labs/Omniroute-with-codex/actions/workflows/ci.yml/badge.svg" /></a>
<a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/License-MIT-007f80.svg" /></a>
<img alt="Node.js 22 or later" src="https://img.shields.io/badge/Node.js-22%2B-234b64.svg" />
<img alt="Windows supervised startup" src="https://img.shields.io/badge/Windows-supervised%20startup-234b64.svg" />
</p>

# OmniRoute with Codex

**Keep your local routing setup. Repair a specific Codex-to-Grok request mismatch. Start the bridge automatically on Windows.**

An independent, dependency-free compatibility bridge maintained by [BambiBear Labs](https://github.com/Bambi-Bear-Labs). Matching Grok requests receive a narrowly scoped context-format repair; other model request bodies and streaming responses pass through without content rewriting.

> [!IMPORTANT]
> **OmniRoute must already be installed, configured, and running.** This project starts the bridge, not OmniRoute. It does not provide credentials, subscriptions, model entitlements, or account/usage-limit bypasses.

**[Windows setup](docs/setup-windows.md)** · **[Configuration](docs/configuration.md)** · **[Troubleshooting](docs/troubleshooting.md)** · **[Recovery SOP](docs/recovery.md)** · **[Security](SECURITY.md)**

## How it fits together

```text
Codex desktop app
        |
        v
127.0.0.1:20129/v1    This compatibility bridge
        |
        v
localhost:20128/v1    Your existing OmniRoute server
        |
        v
Your authorized provider connections
```

| Capability | Behavior |
| --- | --- |
| Targeted Grok repair | Converts only the observed standalone Codex app-context outputs into lower-trust reference messages. |
| Real tools | Preserves valid tool-call/result pairs; never invents call IDs. |
| Streaming | Pipes upstream SSE bytes without parsing or buffering the response. |
| Other models | Forwards their request bodies unchanged. |
| Local operation | Binds only to IPv4 loopback and forwards to a fixed local HTTP upstream. |
| Windows startup | Limited-privilege sign-in task with supervised worker recovery. |
| Account safety | Does not modify provider accounts, the OmniRoute database, or Codex config automatically. |
| Dependencies | Node.js built-ins only; no runtime npm dependencies. |

## Why this exists

Some Codex desktop context records arrive as `function_call_output` items without a `call_id` or matching function call. A strict Responses endpoint can reject the whole request:

```text
invalid "function_call_output" item: missing field `call_id`
```

The bridge handles only the observed `agent` records named `codex_apps_open_page` and `codex_apps_selected_page_part_N_of_N`. It preserves their output as explicitly lower-trust user reference data, not system/developer instructions.

This is **not a general Responses translator**. A successful ping or a response from another client does not prove compatibility with Codex's additional context.

## Quick start: Windows

1. Install a supported Node.js LTS release (22+), Codex, and OmniRoute.
2. Start OmniRoute on `20128`, authorize your providers, and obtain an OmniRoute API key.
3. Download this repository as a ZIP and **extract it**, or clone it.
4. Review and double-click **`Install-Bridge.cmd`** once.
5. Set `OMNIROUTE_API_KEY` and merge the [Codex configuration](docs/configuration.md).
6. Run **`Test-Bridge.cmd`**, fully reopen Codex, and test real model responses.
7. Complete the [reboot acceptance checklist](docs/setup-windows.md#reboot-acceptance-checklist).

No daily bridge script is needed after setup. **OmniRoute remains a separate running dependency.**

```toml
# Top-level keys, before any [table]:
model_provider = "omniroute"
model = "grok-cli/grok-4.7" # Example: verify your server's model IDs.

[model_providers.omniroute]
name = "OmniRoute"
base_url = "http://127.0.0.1:20129/v1"
env_key = "OMNIROUTE_API_KEY"
wire_api = "responses"
http_headers = { "x-omniroute-no-memory" = "true" }
```

Merge rather than replace your full config. Preserve existing authentication settings and unrelated headers. The header disables OmniRoute injection for this provider, not Codex's own memory feature.

### Custom Grok combo aliases

Native routes `grok-cli/grok-*` and `gc/grok-*` are recognized automatically. Opt in user-defined aliases explicitly:

```powershell
& .\windows\Install-Bridge.ps1 -GrokAliases 'my-grok-combo'
```

For manual execution, set `OMNIROUTE_CODEX_GROK_ALIASES` to a comma-separated list before `npm start`. A combo is a route you create in OmniRoute, not a model entitlement.

## Endpoints

| Address | Purpose |
| --- | --- |
| `http://localhost:20128` | OmniRoute dashboard |
| `http://localhost:20128/v1` | Direct API / emergency bypass |
| `http://127.0.0.1:20129/v1` | Codex API through the bridge |
| `http://127.0.0.1:20129/__codex_grok_bridge_health` | Local health without API credentials |

A browser may show `Authentication required` at an API URL. This is expected without a key header; do not disable authentication to make that check succeed.

## Tests

```sh
npm test
npm run check
```

Tests use local mock servers, not paid APIs. CI is configured for Windows/Linux and Node.js 22, 24, and 26, plus Windows script parsing and installer preview. Passing CI does not validate your subscription, real model availability, or a laptop reboot.

## Limits and operating notes

- Windows automation is Windows-only. The Node.js core can be run manually elsewhere; no other autostart integration is supplied.
- Every Codex request sent to `20129` depends on both the bridge and OmniRoute.
- Compressed or larger-than-threshold uploads pass through unchanged and may still trigger the original Grok validation error.
- Ports are fixed defaults. Do not expose this single-user helper to the internet.
- Model IDs, aliases and provider compatibility can change. Examples are not an availability guarantee.
- Use only authorized accounts and comply with provider terms.

## Documentation and community

[Setup](docs/setup-windows.md) · [Configuration](docs/configuration.md) · [Architecture](docs/architecture.md) · [Troubleshooting](docs/troubleshooting.md) · [Recovery](docs/recovery.md)

[Contributing](CONTRIBUTING.md) · [Code of conduct](CODE_OF_CONDUCT.md) · [Changelog](CHANGELOG.md)

## License and attribution

[MIT](LICENSE). Copyright © 2026 Bambi-Bear-Labs.

**Unofficial, independent integration.** Not affiliated with, sponsored by, or endorsed by OpenAI, xAI, or the OmniRoute maintainers. Their trademarks belong to their owners. Codex and OmniRoute are separate products and are not redistributed here.
