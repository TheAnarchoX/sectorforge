param()

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$webProject = Join-Path $root "src\SectorForge.Web"

function Require-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found on PATH."
    }
}

function Invoke-NativeCommand {
    param(
        [string]$Command,
        [string[]]$Arguments
    )

    & $Command @Arguments
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        throw "Command failed with exit code ${exitCode}: $Command $($Arguments -join ' ')"
    }
}

function Invoke-Step {
    param(
        [string]$Name,
        [scriptblock]$Action
    )

    Write-Host ""
    Write-Host $Name -ForegroundColor Cyan
    & $Action
    Write-Host "Completed: $Name" -ForegroundColor Green
}

function Invoke-Pnpm {
    param([string[]]$Arguments)

    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        Invoke-NativeCommand -Command "pnpm" -Arguments $Arguments
        return
    }

    Invoke-NativeCommand -Command "npx" -Arguments (@("--yes", "pnpm@latest") + $Arguments)
}

Require-Command dotnet
Require-Command node
Require-Command npx

Set-Location $root

Invoke-Step -Name "Backend tests" -Action {
    Invoke-NativeCommand -Command "dotnet" -Arguments @("test", ".\src\SectorForge.slnx")
}

Invoke-Step -Name "Format verification" -Action {
    Invoke-NativeCommand -Command "dotnet" -Arguments @("format", ".\src\SectorForge.slnx", "--verify-no-changes")
}

Invoke-Step -Name "Frontend lint" -Action {
    Invoke-Pnpm -Arguments @("--dir", $webProject, "lint")
}

Invoke-Step -Name "Frontend build" -Action {
    Invoke-Pnpm -Arguments @("--dir", $webProject, "build")
}

Write-Host ""
Write-Host "SectorForge verification completed successfully." -ForegroundColor Green
