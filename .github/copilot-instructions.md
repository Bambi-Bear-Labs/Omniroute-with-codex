# Repository guidance

For installation or configuration requests, read `AGENTS.md` and `docs/ai-install.md`. Respect the user's requested scope and all environment permission policies.

Use read-only inspection and a dry run first. Never request or print secrets. Treat CLI profile configuration and desktop-default changes as separate operations. Preserve existing settings and stop for review on ownership, managed-policy, unsafe-path, or concurrent-edit conflicts. Do not install into the developer's live environment merely to run repository tests.
