import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export const OWNER = 'Bambi-Bear-Labs/Omniroute-with-codex';
export class SetupError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new SetupError(code, message); };
export const hash = text => crypto.createHash('sha256').update(text).digest('hex');
export function codexHome(value) { return path.resolve(value || process.env.CODEX_HOME || path.join(os.homedir(), '.codex')); }
export function validateOptions(options) {
  const result = { ...options, home: codexHome(options.home), profile: options.profile || 'omniroute-bridge', provider: options.provider || 'omniroute_bridge' };
  if (!['cli', 'desktop'].includes(result.mode)) fail('mode_required', 'Choose --mode cli or --mode desktop explicitly.');
  if (result.home.toLowerCase().includes('#!sandbox')) fail('unsafe_path', 'The selected Codex home is an isolated app sandbox. Use an authorized host environment; do not bypass its permissions.');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(result.profile) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(result.profile)) fail('invalid_profile', 'Use a simple, non-reserved profile name.');
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(result.provider)) fail('invalid_provider', 'Use a simple provider identifier.');
  if (['openai','ollama','lmstudio'].includes(result.provider.toLowerCase())) fail('invalid_provider', 'Built-in provider identifiers are reserved; choose another provider ID.');
  if (!result.rollback && (typeof result.model !== 'string' || !result.model.trim() || result.model.length > 200 || /[\r\n\x00]/.test(result.model))) fail('model_required', 'Provide an exact model ID with --model.');
  if (!result.rollback && /^(?:sk-|xai-|ghp_|github_pat_)/i.test(result.model) && result.model.length >= 20) fail('model_required', 'The model argument resembles a credential. Never put keys in command arguments.');
  return result;
}
export function providerBlock(provider, eol = '\n') {
  return [
    `# >>> ${OWNER} provider ${provider}`,
    `[model_providers.${provider}]`,
    'name = "OmniRoute compatibility bridge"',
    'base_url = "http://127.0.0.1:20129/v1"',
    'env_key = "OMNIROUTE_API_KEY"',
    'wire_api = "responses"',
    'http_headers = { "x-omniroute-no-memory" = "true" }',
    `# <<< ${OWNER} provider ${provider}`
  ].join(eol);
}
function rootEnd(lines) {
  let depth = 0;
  for (let row = 0; row < lines.length; row++) {
    const line = lines[row];
    if (depth > 0 && /^\s*(?:model_provider|model|["']model_provider["']|["']model["'])\s*=/.test(line)) {
      fail('manual_review', 'Nested multiline selection-like keys require manual review.');
    }
    if (depth === 0 && line.trimStart().startsWith('[')) return row;
    let quote = null;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (quote) {
        if (quote === '"' && char === '\\') { i++; continue; }
        if (char === quote) quote = null;
        continue;
      }
      if (char === '#') break;
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === '[' || char === '{') depth++;
      if (char === ']' || char === '}') depth--;
      if (depth < 0) fail('manual_review', 'Unbalanced root TOML structure; no automatic edit was made.');
    }
    if (quote) fail('manual_review', 'Unclosed root TOML string; manual review is required.');
  }
  if (depth) fail('manual_review', 'Unbalanced root TOML structure; manual review is required.');
  return lines.length;
}
function editDesktop(before, options) {
  if (before.includes('"""') || before.includes("'''")) fail('manual_review', 'Multiline TOML strings require manual review; use an isolated CLI profile or a reviewed manual merge.');
  if (before.includes('\r\n') && /(?<!\r)\n/.test(before)) fail('manual_review', 'Mixed line endings require manual review.');
  const bom = before.startsWith('\uFEFF') ? '\uFEFF' : '';
  const eol = before.includes('\r\n') ? '\r\n' : '\n';
  const lines = before.slice(bom.length).split(eol);
  if (lines.some(line => /^\s*\[[^\r\n]*"[^"\r\n]*\\[^"\r\n]*"/.test(line))) {
    fail('manual_review', 'Escaped quoted table keys require manual review to avoid duplicate TOML tables.');
  }
  const begin = `# >>> ${OWNER} provider ${options.provider}`;
  const end = `# <<< ${OWNER} provider ${options.provider}`;
  const starts = lines.flatMap((line, i) => line === begin ? [i] : []);
  const ends = lines.flatMap((line, i) => line === end ? [i] : []);
  const table = `[model_providers.${options.provider}]`;
  const normalizedHeader = line => line.split('#')[0].replaceAll('"', '').replaceAll("'", '').replaceAll(' ', '').replaceAll('\t', '');
  const tables = lines.flatMap((line, i) => normalizedHeader(line) === table ? [i] : []);
  if (lines.some(line => normalizedHeader(line).startsWith(`[model_providers.${options.provider}.`))) {
    fail('provider_conflict', 'A nested table already belongs to the requested provider; review it manually.');
  }
  if (lines.some(line => normalizedHeader(line) === '[model_providers]')) {
    fail('manual_review', 'An existing parent model_providers table requires a reviewed manual merge.');
  }
  if (starts.length || ends.length) {
    if (starts.length !== 1 || ends.length !== 1 || ends[0] <= starts[0]) fail('ownership_conflict', 'The managed provider markers are ambiguous.');
    if (tables.length !== 1 || tables[0] <= starts[0] || tables[0] >= ends[0]) fail('ownership_conflict', 'The provider appears outside its managed block.');
    const inside = lines.slice(starts[0], ends[0] + 1);
    if (!inside.includes(table)) fail('ownership_conflict', 'The managed provider block does not match its identifier.');
    lines.splice(starts[0], ends[0] - starts[0] + 1, ...providerBlock(options.provider, eol).split(eol));
  } else if (tables.length) {
    fail('provider_conflict', 'That provider identifier already exists outside this project block. Choose another --provider or merge manually.');
  }
  const boundary = rootEnd(lines);
  for (const line of lines.slice(0, boundary)) {
    const key = line.split('=')[0].replaceAll('"','').replaceAll("'",'').replaceAll(' ','').replaceAll('\t','');
    if (key === 'model_providers' || key.startsWith(`model_providers.${options.provider}.`) || key === `model_providers.${options.provider}`) {
      fail('provider_conflict', 'An existing inline or dotted provider definition requires manual review.');
    }
  }
  const selected = { model_provider: options.provider, model: options.model };
  const seen = new Set();
  for (let i = 0; i < boundary; i++) {
    const line = lines[i];
    const keyPart = line.includes('=') ? line.slice(0, line.indexOf('=')).trim() : '';
    if (keyPart.startsWith('"') && keyPart.includes('\\')) fail('manual_review', 'Escaped quoted root keys require manual review.');
    if (/^\s*["'](?:model_provider|model)["']\s*=/.test(line)) fail('manual_review', 'Quoted root selection keys require manual review.');
    const match = line.match(/^\s*(model_provider|model)\s*=/);
    if (!match) continue;
    const key = match[1];
    if (seen.has(key)) fail('manual_review', 'Duplicate root selection keys require manual review.');
    seen.add(key);
    const equal = line.indexOf('=');
    const right = line.slice(equal + 1);
    const value = right.match(/^(\s*)("(?:\\.|[^"\\])*"|'[^']*')(\s*(?:#.*)?)$/);
    if (!value) fail('manual_review', 'A complex root selection value requires manual review.');
    if (value[2].startsWith('"')) {
      try { JSON.parse(value[2]); }
      catch { fail('manual_review', 'An escaped root selection value requires manual review.'); }
    }
    lines[i] = line.slice(0, equal + 1) + value[1] + JSON.stringify(selected[key]) + value[3];
  }
  const missing = Object.entries(selected).filter(([key]) => !seen.has(key)).map(([key, value]) => `${key} = ${JSON.stringify(value)}`);
  if (missing.length) lines.unshift(...missing, '');
  let after = bom + lines.join(eol);
  if (!starts.length) {
    if (after && !after.endsWith(eol)) after += eol;
    after += eol + providerBlock(options.provider, eol) + eol;
  }
  return after;
}
function simpleStringValue(lines, key) {
  const prefix = new RegExp(`^\\s*(?:${key}|"${key}"|'${key}')\\s*=`);
  const candidates = lines.filter(line => prefix.test(line));
  if (candidates.length !== 1) return null;
  const right = candidates[0].slice(candidates[0].indexOf('=') + 1);
  const match = right.match(/^\s*("(?:\\.|[^"\\])*"|'[^']*')\s*(?:#.*)?$/);
  if (!match) return null;
  try { return match[1].startsWith('"') ? JSON.parse(match[1]) : match[1].slice(1, -1); }
  catch { return null; }
}
function existingDesktopBridge(before, options) {
  if (!before || before.includes('"""') || before.includes("'''")) return null;
  const eol = before.includes('\r\n') ? '\r\n' : '\n';
  const lines = before.replace(/^\uFEFF/, '').split(eol);
  const boundary = rootEnd(lines);
  const provider = simpleStringValue(lines.slice(0,boundary), 'model_provider');
  const currentModel = simpleStringValue(lines.slice(0,boundary), 'model');
  if (!provider || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(provider)) return null;
  const normalize = line => line.split('#')[0].replaceAll('"','').replaceAll("'",'').replaceAll(' ','').replaceAll('\t','');
  const table = `[model_providers.${provider}]`;
  const indices = lines.flatMap((line,index) => normalize(line) === table ? [index] : []);
  if (indices.length !== 1) return null;
  const first = indices[0] + 1;
  let last = first;
  while (last < lines.length && !lines[last].trimStart().startsWith('[')) last++;
  const block = lines.slice(first,last);
  const url = simpleStringValue(block,'base_url');
  if (!['http://127.0.0.1:20129/v1','http://localhost:20129/v1'].includes(url)) return null;
  const envKey = simpleStringValue(block,'env_key');
  const wire = simpleStringValue(block,'wire_api');
  const wirePresent = block.some(line => /^\s*(?:wire_api|"wire_api"|'wire_api')\s*=/.test(line));
  const header = block.some(line => /^\s*http_headers\s*=\s*\{[^{}\r\n]*["']?x-omniroute-no-memory["']?\s*=\s*["']true["'][^{}\r\n]*\}\s*(?:#.*)?$/.test(line));
  if (currentModel !== options.model || envKey !== 'OMNIROUTE_API_KEY' || (wirePresent && wire !== 'responses') || !header) {
    fail('manual_review', 'An existing desktop provider already targets the bridge but differs from the requested model or required settings. Review it rather than replacing it.');
  }
  return {provider};
}
export function configurationText(before, rawOptions) {
  const options = validateOptions(rawOptions);
  if (options.mode === 'desktop') return editDesktop(before, options);
  const marker = `# Managed by ${OWNER}; CLI profile ${options.profile}`;
  const eol = before.includes('\r\n') ? '\r\n' : '\n';
  return [marker, `model_provider = ${JSON.stringify(options.provider)}`, `model = ${JSON.stringify(options.model)}`, '', providerBlock(options.provider, eol), ''].join(eol);
}

function readText(file) {
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink > 1) fail('unsafe_path', 'The configuration target must be a regular, unlinked file.');
    const bytes = fs.readFileSync(file);
    const text = bytes.toString('utf8');
    if (!Buffer.from(text).equals(bytes)) fail('manual_review', 'The configuration is not valid UTF-8.');
    return { exists: true, text };
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false, text: '' };
    throw error;
  }
}
function validateHome(home) {
  try {
    const stat = fs.lstatSync(home);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('unsafe_path', 'The Codex home must be a normal directory; redirected homes need manual review.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
export function planConfiguration(rawOptions, { systemPolicyPath } = {}) {
  const options = validateOptions(rawOptions);
  validateHome(options.home);
  const systemPolicy = systemPolicyPath ?? (process.platform === 'win32'
    ? path.join(process.env.ProgramData || 'C:/ProgramData', 'OpenAI', 'Codex', 'requirements.toml')
    : '/etc/codex/requirements.toml');
  if ([path.join(options.home, 'requirements.toml'), systemPolicy].some(file => fs.existsSync(file))) {
    fail('managed_policy', 'A local managed requirements file is present. Review policy before changing routing.');
  }
  const target = path.join(options.home, options.mode === 'desktop' ? 'config.toml' : `${options.profile}.config.toml`);
  const stateDirectory = path.join(options.home, '.omniroute-with-codex');
  validateHome(stateDirectory);
  validateHome(path.join(stateDirectory, 'backups'));
  const stateFile = path.join(stateDirectory, options.mode === 'desktop' ? 'desktop.json' : `cli-${options.profile}.json`);
  const before = readText(target);
  const stateText = readText(stateFile);
  let state = null;
  if (stateText.exists) {
    try { state = JSON.parse(stateText.text); } catch { fail('ownership_conflict', 'The setup state cannot be parsed; manual review is required.'); }
    if (state.owner !== OWNER || state.target !== target || state.mode !== options.mode ||
        typeof state.provider !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(state.provider) ||
        (options.mode === 'cli' && state.profile !== options.profile) ||
        typeof state.appliedHash !== 'string' || !/^[a-f0-9]{64}$/.test(state.appliedHash) ||
        !state.original || typeof state.original.existed !== 'boolean' ||
        typeof state.original.hash !== 'string' || !/^[a-f0-9]{64}$/.test(state.original.hash) ||
        (state.original.existed && typeof state.original.backup !== 'string')) {
      fail('ownership_conflict', 'The setup state is incomplete or belongs to another target.');
    }
  }
  if (options.rollback) {
    const rollbackPlan = { options, target, stateDirectory, stateFile, before, stateText, state, changed: !!state, operation: 'rollback' };
    if (state) validateRollbackPlan(rollbackPlan);
    return rollbackPlan;
  }
  if (state && state.provider !== options.provider) fail('ownership_conflict', 'The managed provider identifier differs. Roll back or review the change manually.');
  if (!state && options.mode === 'desktop') {
    const existing = existingDesktopBridge(before.text, options);
    if (existing) return { options, target, stateDirectory, stateFile, before, stateText, state, after:before.text, changed:false, operation:'configure', effectiveProvider:existing.provider, reusedExisting:true };
  }
  const after = configurationText(before.text, options);
  if (options.mode === 'cli' && before.exists && before.text !== after && !state) fail('profile_conflict', 'The requested profile already exists and is not owned by this setup. Choose another profile.');
  const changed = !before.exists || after !== before.text;
  if (changed && state && hash(before.text) !== state.appliedHash) fail('concurrent_edit', 'This managed file changed after setup. Refusing to overwrite later edits.');
  return { options, target, stateDirectory, stateFile, before, stateText, state, after, changed, operation: 'configure' };
}
export function publicPlan(plan) {
  return {
    schemaVersion: 1, operation: plan.operation, mode: plan.options.mode,
    target: plan.target, profile: plan.options.mode === 'cli' ? plan.options.profile : null,
    targetPlatformSupported: ['win32','darwin','linux'].includes(process.platform) && (plan.options.mode === 'cli' || process.platform === 'win32'),
    model: plan.options.model ?? null, provider: plan.effectiveProvider ?? (plan.operation === 'rollback' ? (plan.state?.provider ?? plan.options.provider) : plan.options.provider),
    reusedExistingConfiguration: !!plan.reusedExisting, rollbackAvailable: !!plan.state,
    changed: plan.changed, mainConfigWouldChange: plan.options.mode === 'desktop' && plan.changed,
    selectedRootKeys: plan.options.mode === 'desktop' && plan.changed ? ['model_provider', 'model'] : [],
    credentialsWritten: false,
    stateFile: plan.stateFile, backupDirectory: path.join(plan.stateDirectory, 'backups'),
    originalConfigExistedBeforeSetup: plan.state ? plan.state.original.existed : plan.before.exists,
    originalBackupRecorded: !!plan.state?.original?.backup,
    preflightRequiredOnApply: plan.operation === 'configure',
    notes: [
      'No full configuration or environment secret is included in this report.',
      'Existing plugins, MCP servers, catalogs and authentication settings are not migrated.',
      'Backups can contain private settings already present in the original file; keep them private.'
    ]
  };
}
function writePreservingFile(file, text, before) {
  const current = readText(file);
  if (current.exists !== before.exists || current.text !== before.text) fail('concurrent_edit', 'The target changed after planning; no overwrite was performed.');
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (!before.exists) {
    try { fs.writeFileSync(file, text, { flag: 'wx', mode: 0o600 }); }
    catch (error) {
      if (error.code === 'EEXIST') fail('concurrent_edit', 'The target appeared after planning.');
      throw error;
    }
    return;
  }
  // Preserve the existing file ACL/mode. Backup permissions inherit the parent on Windows.
  const fd = fs.openSync(file, 'r+');
  try {
    const opened = fs.fstatSync(fd);
    const currentPath = fs.lstatSync(file);
    if (currentPath.isSymbolicLink() || opened.nlink > 1 ||
        opened.dev !== currentPath.dev || opened.ino !== currentPath.ino ||
        fs.readFileSync(fd, 'utf8') !== before.text) {
      fail('concurrent_edit', 'The target changed immediately before writing.');
    }
    const bytes = Buffer.from(text);
    let offset = 0;
    while (offset < bytes.length) {
      const written = fs.writeSync(fd, bytes, offset, bytes.length - offset, offset);
      if (!written) throw new Error('A configuration write made no progress.');
      offset += written;
    }
    fs.ftruncateSync(fd, bytes.length); fs.fsyncSync(fd);
  } catch (error) {
    if (!(error instanceof SetupError)) {
      const original = Buffer.from(before.text);
      let offset = 0;
      while (offset < original.length) {
        const written = fs.writeSync(fd, original, offset, original.length - offset, offset);
        if (!written) throw new Error('The original configuration could not be restored.');
        offset += written;
      }
      fs.ftruncateSync(fd, original.length); fs.fsyncSync(fd);
    }
    throw error;
  } finally { fs.closeSync(fd); }
}
export function applyConfiguration(plan) {
  if (plan.operation === 'rollback') return rollbackConfiguration(plan);
  const latest = readText(plan.target);
  validateHome(plan.options.home);
  validateHome(plan.stateDirectory);
  validateHome(path.join(plan.stateDirectory, 'backups'));
  const currentState = readText(plan.stateFile);
  if (currentState.exists !== plan.stateText.exists || currentState.text !== plan.stateText.text) fail('concurrent_edit', 'The setup state changed after planning.');
  if (latest.exists !== plan.before.exists || latest.text !== plan.before.text) fail('concurrent_edit', 'The target changed after planning.');
  if (!plan.changed) return { ...publicPlan(plan), status: 'unchanged' };
  const backupDirectory = path.join(plan.stateDirectory, 'backups');
  fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  let original = plan.state?.original;
  if (!original) {
    original = { existed: plan.before.exists, hash: hash(plan.before.text), backup: null };
    if (plan.before.exists) {
      original.backup = path.join(backupDirectory, `${Date.now()}-${crypto.randomUUID()}.toml`);
      fs.writeFileSync(original.backup, plan.before.text, { flag: 'wx', mode: 0o600 });
    }
  }
  const previousState = readText(plan.stateFile);
  if (previousState.exists !== plan.stateText.exists || previousState.text !== plan.stateText.text) fail('concurrent_edit', 'The setup state changed after planning.');
  const state = { owner: OWNER, target: plan.target, mode: plan.options.mode,
    profile: plan.options.profile, provider: plan.options.provider, original,
    appliedHash: hash(plan.after), updatedAt: new Date().toISOString() };
  // Persist recovery information before mutating the configuration.
  const writtenState = JSON.stringify(state, null, 2) + '\n';
  writePreservingFile(plan.stateFile, writtenState, previousState);
  try { writePreservingFile(plan.target, plan.after, plan.before); }
  catch (error) {
    const currentState = readText(plan.stateFile);
    // Never erase a concurrently edited state file while recovering a failed write.
    if (currentState.exists && currentState.text === writtenState) {
      if (previousState.exists) writePreservingFile(plan.stateFile, previousState.text, currentState);
      else fs.unlinkSync(plan.stateFile);
    }
    throw error;
  }
  return { ...publicPlan(plan), status: 'applied', rollbackAvailable: true, stateFile: plan.stateFile,
    backup: original.backup, launch: plan.options.mode === 'cli' ? `codex --profile ${plan.options.profile}` : 'Fully quit and reopen the Codex desktop app.' };
}
function validateRollbackPlan(plan) {
  if (!plan.state) return null;
  if (!plan.before.exists || hash(plan.before.text) !== plan.state.appliedHash) fail('concurrent_edit', 'Later edits are present; refusing automatic rollback. Use a reviewed manual merge.');
  const marker = plan.options.mode === 'desktop'
    ? `# >>> ${OWNER} provider ${plan.state.provider}`
    : `# Managed by ${OWNER}; CLI profile ${plan.options.profile}`;
  if (!plan.before.text.includes(marker)) fail('ownership_conflict', 'The target no longer contains its expected project-owned marker.');
  const original = plan.state.original;
  if (!original.existed) return {original,saved:null};
  const backup = path.resolve(original.backup || '');
  const allowed = path.resolve(plan.stateDirectory, 'backups') + path.sep;
  if (!backup.startsWith(allowed)) fail('unsafe_path', 'The recorded backup is outside this setup state directory.');
  const saved = readText(backup);
  if (!saved.exists || hash(saved.text) !== original.hash) fail('backup_mismatch', 'The original backup does not match its recorded hash.');
  return {original,saved};
}
export function rollbackConfiguration(plan) {
  if (!plan.state) return { ...publicPlan(plan), status: 'unchanged' };
  validateHome(plan.options.home);
  validateHome(plan.stateDirectory);
  validateHome(path.join(plan.stateDirectory, 'backups'));
  const currentState = readText(plan.stateFile);
  if (currentState.exists !== plan.stateText.exists || currentState.text !== plan.stateText.text) fail('concurrent_edit', 'The setup state changed after planning.');
  const {original,saved} = validateRollbackPlan(plan);
  if (original.existed) {
    writePreservingFile(plan.target, saved.text, plan.before);
  } else {
    if (path.dirname(path.resolve(plan.target)) !== plan.options.home) fail('unsafe_path', 'Refusing to remove a target outside the selected Codex home.');
    const latest = readText(plan.target);
    if (!latest.exists || latest.text !== plan.before.text) fail('concurrent_edit', 'The profile changed immediately before rollback.');
    fs.unlinkSync(plan.target); // Only this unchanged, project-created file.
  }
  const finalState = readText(plan.stateFile);
  if (finalState.exists && finalState.text === plan.stateText.text) fs.unlinkSync(plan.stateFile); // Backups are retained.
  else fail('state_changed_after_rollback', 'Configuration was restored, but state changed concurrently; review it manually.');
  return { ...publicPlan(plan), status: 'rolled_back', rollbackAvailable: false, backupsRetained: true };
}
