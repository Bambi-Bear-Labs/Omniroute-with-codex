# Architecture and transformation contract

[Back to README](../README.md)

The entry point binds to `127.0.0.1:20129` and forwards to `http://localhost:20128`. Authorization is forwarded in memory; no account database is read. The test factory accepts only alternate loopback HTTP upstreams, not internet proxy targets.

## Eligible requests

A request is inspected only when it is:

1. `POST /v1/responses` (optional trailing slash/query).
2. Identity-encoded JSON within the inspection threshold.
3. A `grok-cli/grok-*`, `gc/grok-*`, or explicitly configured Grok alias route.

Only the following documented history cases are repaired.

### Standalone app-context outputs

An input item must have type `function_call_output`, namespace `agent`, no non-empty string `call_id`, an `output` field, and name `codex_apps_open_page` or `codex_apps_selected_page_part_N_of_N`.

Its original output becomes a user reference message, labeled as data rather than an instruction or tool call. No system/developer privilege or invented call pairing is added.

### Unsupported web-search replay metadata

An input item of type `web_search_call` with `action.type = "other"` is not accepted by the observed Grok endpoint. This can break the next request after the model has already replied and used tools.

The bridge preserves the complete record as lower-trust user reference metadata. It does not invent a search query, URL, action, tool call, or result. Actual function-call outputs and their IDs remain unchanged.

Accepted `search`, `open_page`, and `find_in_page` actions are not rewritten. Unknown future action variants are not silently generalized into another action.

## Preservation guarantees

Real tool pairs, other input records and model settings are preserved. Other providers and unconfigured combo names are not normalized. Requests with no matching change retain their original body bytes.

## Transport

SSE bytes are piped without response parsing/buffering. Hop-by-hop headers are transport metadata; host/content length are adjusted as forwarding requires. Disconnecting clients cancel the upstream request.

Invalid JSON is forwarded for upstream validation. Compressed bodies are not decoded. Above 64 MiB, inspection falls back to unchanged streaming upload instead of rejecting the body. Such Grok requests may still hit a validation error.

## Windows ownership and health

The sign-in task keeps a PowerShell supervisor active. It owns/waits for the Node.js worker and restarts it on exit. Healthy existing instances are reused; unrelated services on the port are never killed automatically.

The health response includes `normalizationVersion`. Version `2` identifies the search-replay repair introduced in release 0.1.1. After changing JavaScript modules, restart the known bridge worker so Node.js loads the new code; a changed source file alone does not update a running worker.

Local logs are `managed-startup.log`, `bridge.stdout.log`, and `bridge.stderr.log`. The bridge intentionally logs no prompts or API keys.
