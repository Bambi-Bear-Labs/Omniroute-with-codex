[CmdletBinding()]
param([switch]$TestGrok,[string]$Model="grok-cli/grok-4.7")
$ErrorActionPreference='Stop'
$kitRoot=Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $kitRoot 'Bridge-Common.ps1')
$health=Read-BridgeHealth
if(-not $health -or $health.id -ne 'codex-grok-context-bridge-v1'){throw 'Bridge health failed. Check the task and port 20129.'}
Write-Output ('Bridge healthy: PID '+$health.pid+', directory '+$health.directory)
$key=$env:OMNIROUTE_API_KEY
if(-not $key){$key=[Environment]::GetEnvironmentVariable('OMNIROUTE_API_KEY','User')}
if(-not $key){throw 'OMNIROUTE_API_KEY is missing. Follow the SOP secure-key setup.'}
$headers=@{Authorization=('Bearer '+$key);'x-omniroute-no-memory'='true'}
$direct=Invoke-LocalJson 'http://localhost:20128/v1/models' $headers
$bridged=Invoke-LocalJson 'http://127.0.0.1:20129/v1/models' $headers
$left=@($direct.data|ForEach-Object{$_.id}|Sort-Object -Unique)
$right=@($bridged.data|ForEach-Object{$_.id}|Sort-Object -Unique)
if(Compare-Object $left $right){throw 'Direct and bridged model discovery differ.'}
Write-Output ('Both authenticated endpoints work; discovered models: '+$left.Count)
Write-Output ('Requested test model available: '+($left -contains $Model))
if($TestGrok){
    $body=@{model=$Model;stream=$false;store=$false;max_output_tokens=256;input=@(@{type='function_call_output';name='codex_apps_open_page';namespace='agent';output='{"page_id":null}'},@{type='message';role='user';content=@(@{type='input_text';text='What is two plus two? Answer briefly.'})})}|ConvertTo-Json -Depth 10
    $reply=Invoke-LocalJson 'http://127.0.0.1:20129/v1/responses' $headers $body
    if($reply.status -ne 'completed'){throw 'Grok did not complete the test.'}
    $text=$reply.output_text
    if(-not $text){$text=(@($reply.output|Where-Object{$_.type -eq 'message'}|ForEach-Object{$_.content}|Where-Object{$_.type -eq 'output_text'}|ForEach-Object{$_.text}) -join '')}
    if(-not $text){throw 'Grok returned no visible text.'}
    Write-Output ('Grok completed: '+$text)
}
Write-Output 'This diagnostic did not modify settings. Never print/share your API key.'
