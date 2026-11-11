import { SetupError } from './configuration.mjs';
const values = new Map([['--mode','mode'],['--model','model'],['--profile','profile'],['--provider','provider'],['--codex-home','home'],['--grok-aliases','grokAliases']]);
const flags = new Map([['--apply','apply'],['--dry-run','dryRun'],['--json','json'],['--rollback','rollback'],['--help','help']]);
export function parseArguments(argv, { allowAliases = false } = {}) {
  const result = {}; const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const [name, ...parts] = argv[i].split('=');
    if (seen.has(name)) throw new SetupError('invalid_arguments', 'An option was supplied more than once.');
    seen.add(name);
    if (flags.has(name)) {
      if (parts.length) throw new SetupError('invalid_arguments', 'Boolean options do not accept a value.');
      result[flags.get(name)] = true; continue;
    }
    if (!values.has(name) || (name === '--grok-aliases' && !allowAliases)) throw new SetupError('invalid_arguments', 'An unsupported option was supplied. API keys must never be passed as command arguments.');
    const value = parts.length ? parts.join('=') : argv[++i];
    if (!value || value.startsWith('--')) throw new SetupError('invalid_arguments', 'A required option value is missing.');
    result[values.get(name)] = value;
  }
  if (result.apply && result.dryRun) throw new SetupError('invalid_arguments', 'Choose either --apply or --dry-run.');
  if (result.mode === 'desktop' && result.profile !== undefined) throw new SetupError('invalid_arguments', '--profile applies only to CLI mode.');
  return result;
}
export function errorResult(error) {
  const review = ['manual_review','provider_conflict','profile_conflict','concurrent_edit','managed_policy','ownership_conflict','unsafe_path','backup_mismatch','alias_conflict','state_changed_after_rollback'];
  return { schemaVersion:1, status:'error', code:error.code || 'setup_failed',
    message:error.message, requiresUserAction:true,
    exitCode:review.includes(error.code)?3:(error instanceof SetupError?2:1),
    ...(error.effects ? {effects:error.effects} : {}) };
}
export function output(value) { console.log(JSON.stringify(value, null, 2)); }
export function normalizeAliases(value) {
  if (value === undefined) return undefined;
  const aliases=[...new Set(value.split(',').map(alias=>alias.trim()).filter(Boolean))];
  if(!aliases.length||aliases.length>32||aliases.some(alias=>alias.length>200||/[\x00-\x1f\x7f]/.test(alias)||(/^(?:sk-|xai-|ghp_|github_pat_)/i.test(alias)&&alias.length>=20))) {
    throw new SetupError('invalid_arguments','Use 1-32 comma-separated route aliases; never include credentials.');
  }
  return aliases;
}
