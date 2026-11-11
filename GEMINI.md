# Project guidance for Gemini CLI

Read `AGENTS.md` and `docs/ai-install.md` before helping a user install or configure this project. Follow the user's instructions and the execution environment's permissions.

Use the read-only doctor and dry run first. Do not request or print secrets. Distinguish CLI profile isolation from an explicit desktop-default change, preserve unrelated settings, and stop on ownership, policy, or concurrent-edit conflicts. Repository tests use isolated fixtures; do not modify the developer's live setup merely to test.
