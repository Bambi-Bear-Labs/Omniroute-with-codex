# Troubleshooting

[Back to README](../README.md)

| Symptom | Check / safe next action |
| --- | --- |
| All models fail through `20129` | Check bridge health/task state, then OmniRoute on `20128`. Every request through this URL needs both services. |
| Direct `20128` works, bridge does not | Bridge/startup issue. Use the direct URL temporarily for other models; Grok's original context mismatch may return. |
| Browser says `Authentication required` | An API URL is not a dashboard; the browser sends no API key. Use the dashboard or health URL. Do not disable authentication. |
| `function_call_output` missing `call_id` | Check the bridge URL, documented record scope, and custom alias opt-in. Reopen Codex after config edits. |
| `tools[N]: missing field name` | Verify the OmniRoute memory opt-out header. Injected nested function tools can be incompatible with the Responses shape. |
| Model/alias not found | Check authenticated `/v1/models` and your OmniRoute routing definitions. A picker entry does not create a route. |
| Script path not recognized | Use the root CMD launcher or PowerShell's `&` with a quoted path. Do not prefix `C:` with `/`, or type `run` or a standalone `$`. |
| Installer says task exists | Reuse a healthy helper after a Codex-only reinstall. See recovery before deliberately reinstalling it. |
| Task registration denied | Ask administrator/IT. Do not weaken policy or install under another person's identity. |
| Key works in terminal, not Codex | Fully close Codex; sign out/back in or launch a fresh session so it inherits the user environment. |
| Provider overloaded/quota exhausted | Read the actual upstream error. The bridge does not fix outages, quotas, unsupported IDs or subscription access. |

## Safe diagnostics

- `Test-Bridge.cmd`: health and authenticated model discovery; no model prompt.
- `Test-Bridge.cmd -TestGrok -Model <available-id>`: small real request, may consume quota.
- Helper logs: `managed-startup.log`, `bridge.stderr.log`, `bridge.stdout.log`.
- Task Scheduler: inspect only the specific bridge task.

Never post keys, cookies, OAuth tokens, account exports, private prompts, or unredacted usernames/paths. Use generic errors, versions, synthetic examples and redacted diagnostics.

## Startup ordering

A Startup-folder entry can start after the client has exhausted retries. Use the documented no-delay sign-in task and active supervisor. A provider ping does not validate that startup path; complete the reboot checklist.
