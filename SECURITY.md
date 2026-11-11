# Security policy

This is a single-user local helper, not an internet gateway or authentication service. Keep it on loopback and use only an authorized local OmniRoute server.

- Authorization is forwarded in memory; bridge files/logs do not intentionally store API keys.
- Prompts/tool outputs are processed in memory and are not intentionally logged.
- The unauthenticated health endpoint exposes local process/directory information; keep it local.
- Environment variables and helper config are not password vaults.
- Use only authorized provider accounts and comply with provider terms.

This bridge does not protect an already compromised local account or control logging by Codex, OmniRoute, the OS or upstream providers.

## Report privately

Do not disclose secrets or exploitable details in a public issue. Use GitHub's **Report a vulnerability** feature if available, or arrange private disclosure through the public contact channel on the [BambiBear Labs organization profile](https://github.com/Bambi-Bear-Labs).

Include affected versions, a minimal synthetic reproduction and impact. Never send real tokens, keys, account databases or private prompts.

## Support scope

Security fixes are intended for the current `0.1.x` line. No response-time or support-level agreement is promised. Review updates and validate your destination environment.

## AI-assisted configuration and backups

The preview-first setup tools do not place the OmniRoute key in generated configuration, process arguments, task definitions, or status output. They may create a local backup of an existing Codex configuration, which can already contain sensitive values. Restrictive POSIX modes are requested where supported; Windows ACLs are inherited from the parent directory. Verify those permissions and treat backups as private.

The desktop editor checks for known conflicts and concurrent changes at plan/write boundaries, but it does not provide an interprocess lock or guarantee recovery from every crash or power loss. Avoid simultaneous edits, retain the backup, and review manually if a guard stops. Managed policy may come from sources beyond locally detected requirements files; never bypass organizational policy.
