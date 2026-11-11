# Contributing

Thank you for helping improve this independent BambiBear Labs project.

Read setup/troubleshooting before reporting a problem. Confirm direct OmniRoute works and the requested model ID is available. Never include secrets, private prompts, account exports or personal catalogs.

## Development

Use a supported Node.js LTS release, version 22+. No runtime dependencies are required.

```sh
npm test
npm run check
```

Tests use mock loopback servers, not real provider APIs. On Windows, parse the PowerShell files with Windows PowerShell 5.1 and preview installation with `-WhatIf`. Do not register tasks or edit live configuration in CI.

## Pull requests

- Keep changes focused and describe the problem/use case.
- Add a regression test before widening transformations.
- Preserve real tool pairs, unrelated requests, streaming, cancellation and loopback boundaries.
- Never add credentials, personal paths or private instruction catalogs.
- Update documentation when behavior changes.
- State tested OS/Node.js versions and distinguish mock/provider/reboot tests.

Contributions may be distributed under the project's MIT license.
