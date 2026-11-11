import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArguments, output, errorResult } from './lib/arguments.mjs';
import { codexHome } from './lib/configuration.mjs';
import { directGateway, gatewayPreflight } from './lib/gateway.mjs';
import { windowsBridge, taskReadinessIssue } from './lib/windows.mjs';

export function classifySelectedRoute(model, task) {
  if (!model) return 'not-requested';
  if (/^(?:grok-cli|gc)\/grok-/.test(model)) return 'native-grok-route';
  if (!task?.aliasInventoryKnown) return 'unknown';
  return (task.grokAliases || []).includes(model) ? 'configured-grok-alias' : 'not-configured-as-grok-alias';
}
export async function doctor(argv, dependencies={}){
  const args=parseArguments(argv);
  if(args.apply||args.rollback)throw new Error('Doctor is read-only; use setup/configure for explicit changes.');
  if(args.help)return {schemaVersion:1,status:'help',usage:'node scripts/doctor.mjs [--model <available-id>] [--codex-home <path>] [--json]',mutationsPerformed:false};
  const result={schemaVersion:1,status:'inspection',mutationsPerformed:false,platform:process.platform,
    nodeVersion:process.versions.node,nodeSupported:Number(process.versions.node.split('.')[0])>=22,
    codexHome:codexHome(args.home),apiKeyPresent:!!process.env.OMNIROUTE_API_KEY,
    automaticStartupSupported:process.platform==='win32',omniroute:null,gateway:null,windowsTask:null,issues:[]};
  if(result.nodeSupported){
    try{
      const direct=await(dependencies.direct||directGateway)({model:args.model});
      result.omniroute={authenticated:true,modelCount:direct.modelCount,selectedModelAvailable:direct.selectedModelAvailable};
      result.gateway=await(dependencies.preflight||gatewayPreflight)({model:args.model,directResult:direct});
    } catch(error){result.issues.push({code:error.code||'gateway_check_failed',message:error.message});}
  }else result.issues.push({code:'runtime_missing',message:'Node.js 22+ is required.'});
  if(result.automaticStartupSupported){
    try{
      result.windowsTask=(dependencies.inspect||windowsBridge)('inspect');
      const issue=taskReadinessIssue(result.windowsTask);
      if(issue&&!result.issues.some(item=>item.code===issue.code))result.issues.push(issue);
    } catch(error){result.issues.push({code:error.code||'task_inspection_failed',message:error.message});}
  }
  result.ready=!!result.gateway&&(!result.automaticStartupSupported||!!result.windowsTask?.ready);
  result.selectedRouteNormalization=classifySelectedRoute(args.model,result.windowsTask);
  result.readinessScope='Gateway discovery and bridge/task health only; this does not verify the selected Codex client.';
  result.clientConfigurationVerified=false;
  result.modelInferenceVerified=false;
  result.rebootVerified=false;
  return result;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try{const result=await doctor(process.argv.slice(2));output(result);if(result.status==='inspection'&&!result.ready)process.exitCode=2;}
  catch(error){const result=errorResult(error);output(result);process.exitCode=result.exitCode;}
}
