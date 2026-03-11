param(
  [string]$McpConfigPath = ".vscode/mcp.json",
  [string]$Scope = "ea9ffc3e-8a23-4a7d-836d-234d7c7565c1/.default",
  [string]$ServerName = "MCPManagement"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $McpConfigPath)) {
  throw "MCP config not found at: $McpConfigPath"
}

$token = (& "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" account get-access-token --scope $Scope --query accessToken -o tsv)
if ([string]::IsNullOrWhiteSpace($token)) {
  throw "Failed to get access token from Azure CLI."
}

$cfg = Get-Content -Raw $McpConfigPath | ConvertFrom-Json
$server = $cfg.servers.$ServerName
if (-not $server) {
  throw "Server '$ServerName' not found in $McpConfigPath"
}

if (-not $server.headers) {
  $server | Add-Member -NotePropertyName headers -NotePropertyValue (@{})
}

$server.headers.Authorization = "Bearer $token"
$cfg | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $McpConfigPath

Write-Output "Updated $ServerName auth header in $McpConfigPath"
