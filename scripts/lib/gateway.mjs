import { SetupError } from './configuration.mjs';
export const DIRECT_URL = 'http://localhost:20128/v1';
export const BRIDGE_URL = 'http://127.0.0.1:20129/v1';
export const HEALTH_URL = 'http://127.0.0.1:20129/__codex_grok_bridge_health';
async function localJson(url, { apiKey, fetchImpl = fetch, service = 'gateway' } = {}) {
  const unavailable = service === 'omniroute' ? 'omniroute_unavailable' : 'bridge_unavailable';
  let response;
  try {
    response = await fetchImpl(url, { redirect:'error', signal:AbortSignal.timeout(15000),
      headers:apiKey?{Authorization:`Bearer ${apiKey}`}:{}});
  } catch { throw new SetupError(unavailable, 'The required ' + service + ' loopback service is unavailable. No routing change was made.'); }
  if (response.status === 401 || response.status === 403) {
    if (!apiKey) throw new SetupError('bridge_unavailable', 'The bridge health endpoint rejected access; no key was sent to it.');
    throw new SetupError('authentication_failed', 'The configured API key was rejected. No secret is included in this report.');
  }
  if (!response.ok) throw new SetupError(unavailable, `The ${service} loopback service returned HTTP ${response.status}.`);
  try { return await response.json(); }
  catch { throw new SetupError('invalid_gateway_response', 'A loopback service did not return the expected JSON.'); }
}
export async function directGateway({ model, apiKey = process.env.OMNIROUTE_API_KEY, fetchImpl } = {}) {
  if (!apiKey) throw new SetupError('credentials_missing', 'OMNIROUTE_API_KEY must be available in this process. Set it securely, not in an AI prompt or command argument.');
  const data = await localJson(DIRECT_URL+'/models', {apiKey,fetchImpl,service:'omniroute'});
  if (!Array.isArray(data.data) || data.data.some(item=>typeof item.id!=='string')) throw new SetupError('invalid_gateway_response', 'The model discovery response has an unsupported shape.');
  const ids = [...new Set(data.data.map(item=>item.id))].sort();
  if (model && !ids.includes(model)) throw new SetupError('model_unavailable', 'The requested model ID is not exposed by your authenticated OmniRoute server. Do not invent a route or entitlement.');
  return {ids,modelCount:ids.length,selectedModelAvailable:model?true:null};
}
export async function gatewayPreflight(options = {}) {
  const direct = options.directResult || await directGateway(options);
  const health = await localJson(HEALTH_URL, {fetchImpl:options.fetchImpl,service:'bridge'});
  if (health.id !== 'codex-grok-context-bridge-v1') throw new SetupError('bridge_unavailable', 'The expected project bridge is not listening on port 20129.');
  if (!Number.isInteger(health.normalizationVersion) || health.normalizationVersion < 2) throw new SetupError('bridge_revision_old', 'The running bridge lacks the tool/web-search continuation repair. Do not switch Codex routing yet.');
  const bridged = await localJson(BRIDGE_URL+'/models', {apiKey:options.apiKey ?? process.env.OMNIROUTE_API_KEY,fetchImpl:options.fetchImpl,service:'bridge'});
  if (!Array.isArray(bridged.data) || bridged.data.some(item=>typeof item.id!=='string')) throw new SetupError('invalid_gateway_response', 'The bridged discovery response has an unsupported shape.');
  const ids = [...new Set(bridged.data.map(item=>item.id))].sort();
  if (JSON.stringify(ids)!==JSON.stringify(direct.ids)) throw new SetupError('discovery_mismatch', 'Direct and bridged discovery differ; no Codex routing change was made.');
  return {bridgeHealthy:true,normalizationVersion:health.normalizationVersion,modelCount:direct.modelCount,
    selectedModelAvailable:direct.selectedModelAvailable,discoveryMatches:true};
}
