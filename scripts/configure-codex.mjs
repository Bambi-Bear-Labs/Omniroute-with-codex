import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArguments, errorResult, output } from './lib/arguments.mjs';
import { planConfiguration, publicPlan, applyConfiguration, SetupError } from './lib/configuration.mjs';
import { gatewayPreflight } from './lib/gateway.mjs';

export async function configure(argv, dependencies = {}) {
  const args = parseArguments(argv);
  if (args.help) return {usage:'node scripts/configure-codex.mjs --mode cli|desktop --model <available-id> [--profile omniroute-bridge] [--codex-home <path>] [--dry-run|--apply] [--json]',rollback:'Add --rollback; --apply is still required to restore/remove a managed file.',secrets:'Use OMNIROUTE_API_KEY in the process environment. No --api-key option exists.'};
  if (args.rollback && args.model !== undefined) throw new SetupError('invalid_arguments', 'Omit --model when rolling back.');
  const plan = (dependencies.plan || planConfiguration)(args);
  if (!args.apply) return {...publicPlan(plan),status:'dry_run',writesPerformed:false};
  const platform = dependencies.platform || process.platform;
  if (!args.rollback && ((!['win32','darwin','linux'].includes(platform)) || (plan.options.mode === 'desktop' && platform !== 'win32'))) {
    throw new SetupError('unsupported_platform', 'Automated desktop configuration is supported on Windows only; CLI profiles are supported on Windows, macOS and Linux.');
  }
  if (Number(process.versions.node.split('.')[0]) < 22) throw new SetupError('runtime_missing', 'A supported Node.js LTS release, version 22 or later, is required.');
  const gateway = args.rollback ? null : await (dependencies.preflight || gatewayPreflight)({model:plan.options.model});
  return {...applyConfiguration(plan),gateway,validationStillRequired:['Actual Codex client response','Tool-result continuation','Destination laptop reboot when startup changes']};
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { output(await configure(process.argv.slice(2))); }
  catch (error) { const result=errorResult(error);output(result);process.exitCode=result.exitCode; }
}
