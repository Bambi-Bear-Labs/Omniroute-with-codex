# Recovery, migration and rollback SOP

[Back to README](../README.md)

## Only Codex was reinstalled

1. Confirm OmniRoute remains configured and running.
2. Check existing bridge health and the scheduled task.
3. Reuse a healthy helper; do not install another task.
4. Restore only missing API-key/config/catalog settings from the configuration guide.
5. Preserve the destination installation's own plugin/runtime paths and unrelated settings.
6. Reopen Codex, test visible replies, and repeat reboot acceptance if startup changed.

## New laptop or complete helper reinstall

Follow Windows setup from the beginning. Reconnect authorized providers and recreate your combo aliases separately. This repository includes no account database, API keys, OAuth tokens, personal model catalog or private routing definitions.

Do not use an old `runtime.json`, another user's exported task/SID, or an entire machine-specific Codex config as the installer. The setup script discovers the destination Node.js path and current user.

## Emergency direct route

1. Close Codex and back up `config.toml`.
2. Change only the OmniRoute provider URL to `http://localhost:20128/v1`.
3. Reopen Codex and test another provider.

This bypasses the bridge. It may restore other models while leaving the original Grok context mismatch unresolved.

## Remove the managed task

First restore the direct route above. Then:

```powershell
& .\Uninstall-Bridge.cmd
```

The uninstaller verifies ownership, stops/unregisters only the named helper task, and stops only its known matching worker if it remains. Helper files, Codex config, catalog, keys and OmniRoute are left untouched.

Never kill every `node.exe` process or delete unrelated scheduled tasks.

## Backup and upgrades

Keep a known-good source release, local config/catalog backups, and a secure separate OmniRoute backup. Recheck models/versions before upgrading. Repeat local tests, a real Grok reply, another provider reply, and reboot acceptance after material changes.

The shim is intentionally narrow. If future versions no longer need it, validate the direct route before removing only the bridge-specific setup.
