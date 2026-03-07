param(
  [Parameter(Mandatory = $true)]
  [string]$Terminal,

  [Parameter(Mandatory = $true)]
  [string]$Task,

  [string]$Next,

  [string]$Blocker
)

$contextPath = Join-Path (Get-Location) "CONTEXT.md"
if (-not (Test-Path $contextPath)) {
  throw "CONTEXT.md not found at $contextPath"
}

$timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
$status = if ([string]::IsNullOrWhiteSpace($Blocker)) { "Done" } else { "Blocked" }

$lines = @()
$lines += ""
$lines += "## Activity Log"
$lines += "- [$timestamp] [$Terminal] [$status] Task: $Task"
if (-not [string]::IsNullOrWhiteSpace($Next)) {
  $lines += "  Next: $Next"
}
if (-not [string]::IsNullOrWhiteSpace($Blocker)) {
  $lines += "  Blocker: $Blocker"
}

$content = Get-Content $contextPath -Raw
if ($content -notmatch "(?m)^## Activity Log\s*$") {
  Add-Content -Path $contextPath -Value ($lines -join "`r`n")
} else {
  $entry = @()
  $entry += "- [$timestamp] [$Terminal] [$status] Task: $Task"
  if (-not [string]::IsNullOrWhiteSpace($Next)) {
    $entry += "  Next: $Next"
  }
  if (-not [string]::IsNullOrWhiteSpace($Blocker)) {
    $entry += "  Blocker: $Blocker"
  }
  Add-Content -Path $contextPath -Value ($entry -join "`r`n")
}

Write-Output "Synced context at $timestamp"
