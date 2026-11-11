import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { SetupError } from './configuration.mjs';
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export function windowsBridge(operation = 'inspect', { grokAliases, runner = spawnSync, platform = process.platform } = {}) {
  if (platform !== 'win32') throw new SetupError('unsupported_platform', 'Automatic bridge startup is implemented for Windows only. A portable CLI profile can be configured separately after a bridge is running.');
  const script = path.join(repository, 'windows', operation === 'ensure' ? 'Ensure-Bridge.ps1' : 'Inspect-Bridge.ps1');
  const executable = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const args = ['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',script];
  if (grokAliases !== undefined) args.push('-GrokAliases', grokAliases);
  const child = runner(executable, args, {encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:2*1024*1024});
  let result;
  try { result = JSON.parse(String(child.stdout || '').replace(/^\uFEFF/, '').trim()); }
  catch { throw new SetupError('task_permission_required', 'Windows task inspection/setup did not return a valid report. Check execution permissions; do not bypass organizational policy.'); }
  if (child.status !== 0 || result.status === 'error') {
    const error = new SetupError(result.code || 'task_setup_failed', result.message || 'Windows bridge setup did not complete.');
    const action = result.effects?.bridgeAction;
    if (['none','installation_attempted','installed','start_attempted','started_existing_task','reused'].includes(action)) {
      error.effects = {bridgeAction:action,configuration:'not applied'};
    }
    throw error;
  }
  return result;
}
export function taskReadinessIssue(task) {
  if (!task || task.taskInspectionUnavailable) return {code:'task_permission_required',message:'Windows task ownership/state could not be inspected.'};
  if (task.portConflict) return {code:'ownership_conflict',message:'The bridge port is owned by an unexpected service or directory.'};
  if (task.taskExists && !task.taskOwnedByProject) return {code:'ownership_conflict',message:'The existing task is not owned by this helper/current user.'};
  if (task.bridgeHealthy && task.normalizationVersion < 2) return {code:'bridge_revision_old',message:'The active bridge lacks the continuation repair.'};
  if (!task.taskExists) return {code:'bridge_task_missing',message:'The managed bridge task is not installed; this is expected before a first installation.'};
  if (!task.taskRunning) return {code:'bridge_task_stopped',message:'The owned bridge task is stopped; a healthy orphan worker may still be responding.'};
  if (!task.bridgeHealthy) return {code:'bridge_unavailable',message:'The task is running but the expected bridge is not healthy yet.'};
  return null;
}
