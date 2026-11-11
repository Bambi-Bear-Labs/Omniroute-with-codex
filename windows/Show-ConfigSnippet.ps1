param([string]$Model='grok-cli/grok-4.7')
$catalog=Join-Path $env:USERPROFILE '.codex\omniroute-models.json'
$catalogToml=ConvertTo-Json -InputObject $catalog -Compress
$modelToml=ConvertTo-Json -InputObject $Model -Compress
@"
# Merge TOP-LEVEL keys before the first TOML [table]. Keep your own default model if preferred.
model_provider = "omniroute"
model = $modelToml
model_catalog_json = $catalogToml
model_reasoning_effort = "high"

# Merge this provider section; never create a duplicate table.
[model_providers.omniroute]
name = "OmniRoute"
base_url = "http://127.0.0.1:20129/v1"
env_key = "OMNIROUTE_API_KEY"
wire_api = "responses"
http_headers = { "x-omniroute-no-memory" = "true" }
"@
Write-Output '# Display only: config.toml has not been edited.'
