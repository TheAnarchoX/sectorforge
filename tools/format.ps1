param(
    [switch]$Verify
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$webProject = Join-Path $root "src\SectorForge.Web"

function Invoke-Pnpm {
    param([string[]]$Arguments)

    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        & pnpm @Arguments
        return
    }

    & npx --yes pnpm@latest @Arguments
}

Set-Location $root

if ($Verify) {
    dotnet format .\src\SectorForge.slnx --verify-no-changes
}
else {
    dotnet format .\src\SectorForge.slnx
}

Invoke-Pnpm -Arguments @("--dir", $webProject, "lint")
