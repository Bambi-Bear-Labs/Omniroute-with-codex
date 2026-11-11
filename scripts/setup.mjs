import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArguments, normalizeAliases, errorResult, output } from './lib/arguments.mjs';
import { planConfiguration, publicPlan, applyConfiguration, SetupError } from './lib/configuration.mjs';
import { directGateway, gatewayPreflight } from './lib/gateway.mjs';
import { windowsBridge } from './lib/windows.mjs';

export async function setup(argv, dependencies = {}) {
  const args=parseArguments(argv,{allowAliases:true});
  if(args.help)return {usage:'node scripts/setup.mjs --mode cli|desktop --model <available-id> [--profile omniroute-bridge] [--grok-aliases <comma-list>] [--dry-run|--apply] [--json]',default:'Preview only. --apply is required for files or Windows task changes.',credentials:'OMNIROUTE_API_KEY must already be available in the process environment.'};
  if(args.rollback)throw new SetupError('invalid_arguments','Use configure-codex.mjs --rollback for configuration; the task uninstaller is separate.');
  const aliases=normalizeAliases(args.grokAliases);
  const plan=(dependencies.plan||planConfiguration)(args);
  if(!args.apply)return {...publicPlan(plan),status:'dry_run',writesPerformed:false,bridgePlan:{platform:'win32',currentPlatform:process.platform,supported:process.platform==='win32',action:'Reuse a healthy, project-owned task or install once; never duplicate.',grokAliases:aliases??null},preflight:'Authenticated model discovery and bridge checks run before configuration is applied.',aliasNote:'If the selected ID is a Grok combo, explicitly provide --grok-aliases; aliases are never guessed.'};
  if((dependencies.platform||process.platform)!=='win32')throw new SetupError('unsupported_platform','Automatic startup setup is Windows-only. Use manual bridge operation and the portable CLI-profile configurator on other platforms.');
  if(Number(process.versions.node.split('.')[0])<22)throw new SetupError('runtime_missing','Use a supported Node.js LTS release, version 22 or later.');
  await (dependencies.direct||directGateway)({model:plan.options.model});
  const bridge=(dependencies.ensure||windowsBridge)('ensure',{grokAliases:aliases?.join(',')});
  try {
    const gateway=await (dependencies.preflight||gatewayPreflight)({model:plan.options.model});
    const config=applyConfiguration(plan);
    return {schemaVersion:1,status:'configured',bridge,configuration:config,gateway,
      credentialsWritten:false,omnirouteInstalledOrStarted:false,
      aliasNote:'Custom Grok aliases are never guessed. If runtime alias metadata is unavailable, review the existing helper before assuming an alias is enabled.',
      verificationStillRequired:['Actual CLI or desktop response','Tool-result continuation and next follow-up','Full laptop reboot if startup was installed/changed']};
  } catch (error) {
    error.effects={bridgeAction:['installed','reused','started_existing_task'].includes(bridge?.action)?bridge.action:'unknown',
      configuration:'not applied or requires manual review'};
    throw error;
  }
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try{output(await setup(process.argv.slice(2)));}
  catch(error){const result=errorResult(error);output(result);process.exitCode=result.exitCode;}
}
