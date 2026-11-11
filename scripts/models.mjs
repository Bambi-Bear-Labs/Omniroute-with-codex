import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SetupError } from './lib/configuration.mjs';
import { directGateway } from './lib/gateway.mjs';
import { output,errorResult } from './lib/arguments.mjs';
export async function models(argv,dependencies={}){
  let contains='',limit=20;const seen=new Set();
  for(let i=0;i<argv.length;i++){
    const [name,...parts]=argv[i].split('=');
    if(seen.has(name))throw new SetupError('invalid_arguments','An option was supplied more than once.');
    seen.add(name);
    if(name==='--json'){if(parts.length)throw new SetupError('invalid_arguments','Boolean options do not accept a value.');continue}
    if(name==='--help'&&parts.length)throw new SetupError('invalid_arguments','Boolean options do not accept a value.');
    if(name==='--help')return {schemaVersion:1,status:'help',usage:'node scripts/models.mjs [--contains grok] [--limit 20] [--json]',privacy:'Model IDs may contain private route names; do not publish the output.'};
    if(!['--contains','--limit'].includes(name))throw new SetupError('invalid_arguments','Use only --contains, --limit, --json or --help. Never pass credentials as arguments.');
    const value=parts.length?parts.join('='):argv[++i];
    if(!value||value.startsWith('--'))throw new SetupError('invalid_arguments','A required option value is missing.');
    if(name==='--contains'){
      if(/^(?:sk-|xai-|ghp_|github_pat_)/i.test(value)&&value.length>=20)throw new SetupError('invalid_arguments','The search term resembles a credential; never pass keys as arguments.');
      contains=value.toLowerCase();
    }else{
      if(!/^[0-9]+$/.test(value)||Number(value)<1||Number(value)>100)throw new SetupError('invalid_arguments','The limit must be an integer from 1 to 100.');
      limit=Number(value);
    }
  }
  const direct=await(dependencies.direct||directGateway)();
  const matches=direct.ids.filter(id=>id.toLowerCase().includes(contains));
  return {schemaVersion:1,status:'ok',modelIds:matches.slice(0,limit),shown:Math.min(matches.length,limit),matchingCount:matches.length,totalCount:direct.modelCount,truncated:matches.length>limit,credentialsWritten:false};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{output(await models(process.argv.slice(2)));}catch(error){const result=errorResult(error);output(result);process.exitCode=result.exitCode;}
}
