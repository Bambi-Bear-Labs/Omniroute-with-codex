# Windows setup

[Back to README](../README.md)

## Prerequisites

- Windows with Task Scheduler and Windows PowerShell 5.1 or PowerShell 7.
- A supported Node.js LTS release, version 22+, available as `node.exe`.
- Codex installed and launched once, then closed before config edits.
- OmniRoute configured and running at `http://localhost:20128`.
- Authorized provider connections and an OmniRoute API key.

This project does **not** start OmniRoute, sign into providers, import accounts, grant model access, or change firewall rules.

## 1. Obtain and inspect

Clone the repository or use **Code > Download ZIP**, then extract it. Review scripts before execution. Do not run from inside the ZIP.

## 2. Install the bridge

Double-click `Install-Bridge.cmd`. Its execution-policy flag applies only to its own process; no saved policy is changed.

No-change preview from PowerShell:

```powershell
& .\Install-Bridge.cmd -WhatIf
```

The installer discovers Node.js, checks the port, copies helper files to `%LOCALAPPDATA%\CodexGrokBridge`, runs local tests, and creates/starts `Codex Grok Bridge - <WindowsUser>`. No Codex config or credential is changed.

An existing task is not overwritten. Reuse a healthy helper after a Codex-only reinstall; follow [recovery](recovery.md) for a full repair.

| Task setting | Value |
| --- | --- |
| Trigger | Current user sign-in; no delay |
| Identity | Interactive user; limited privileges |
| Credentials | No saved password |
| Battery | Allow start; do not stop on battery |
| Runtime | Unlimited; supervisor stays active |
| Duplicates | Ignore a second task start |
| Recovery | Restart worker; retry supervisor on failure |

Do not add a second Startup-folder shortcut. Those may start after Codex has exhausted connection retries. If company policy blocks task registration, ask your administrator; do not weaken policy or install under someone else's identity.

## 3. Configure Codex

Follow [configuration](configuration.md) for the API key, provider block, optional catalog, and custom aliases. The installer deliberately leaves current model/default/account settings untouched.

## 4. Verify

Start OmniRoute if necessary. Double-click `Test-Bridge.cmd` for authenticated direct/bridged model discovery. Local health:

```text
http://127.0.0.1:20129/__codex_grok_bridge_health
```

Optional small real request (may consume quota):

```powershell
& .\Test-Bridge.cmd -TestGrok -Model 'grok-cli/grok-4.7'
```

Use an available model ID. Reopen Codex and check visible Grok and unrelated-provider replies. A ping/connected badge alone is insufficient.

## Reboot acceptance checklist

- [ ] Sign into Windows after a full reboot.
- [ ] The bridge task is Running without a manual command.
- [ ] OmniRoute itself is running, manually or through its own startup.
- [ ] Health reports the permanent directory and a PID.
- [ ] Both authenticated model-list endpoints work.
- [ ] Codex gets visible Grok and other-provider replies.
- [ ] Model/default/account settings remain as intended.

Repeat on every destination laptop. Script-start or mock tests do not prove a full reboot.
