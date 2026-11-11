# Architecture and transformation contract

[Back to README](../README.md)

The entry point binds to `127.0.0.1:20129` and forwards to `http://localhost:20128`. Authorization is forwarded in memory; no account database is read. The test factory permits only alternate **loopback HTTP** upstreams, not internet proxy targets.

## Exact scope

All conditions must match:

1. `POST /v1/responses` (optional trailing slash/query).
2. Identity-encoded JSON within the inspection threshold.
3. `grok-cli/grok-*`, `gc/grok-*`, or an explicitly configured Grok alias.
4. An input item of type `function_call_output`, namespace `agent`, without a non-empty string `call_id`.
5. Name `codex_apps_open_page` or `codex_apps_selected_page_part_N_of_N`, and an `output` field.

Only that item becomes a `user` reference message. Original output text is preserved and labeled as reference data, not an instruction/tool call. No system/developer privilege or invented pairing is added.

Real tool pairs, other inputs and model settings are preserved. Without a matching change, original request-body bytes are retained.

## Transport

SSE bytes are piped without response parsing/buffering. Hop-by-hop headers are treated as transport metadata; host/content length are adjusted as forwarding requires. Disconnecting clients cancel the upstream request.

Invalid JSON is forwarded for upstream validation. Compressed bodies are not decoded. Above 64 MiB, inspection falls back to unchanged streaming upload instead of rejecting the body. Such Grok requests may still hit the original error.

## Windows ownership

The sign-in task keeps a PowerShell supervisor active. It owns/waits for its Node.js worker and restarts it on exit, rather than detaching and ending. Existing healthy instances are reused. An unrelated service on the port is never killed automatically.

Local logs are `managed-startup.log`, `bridge.stdout.log`, and `bridge.stderr.log`. The bridge intentionally logs no prompts or API keys.
