param(
    [switch]$Full
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")

Set-Location $root

Get-ChildItem -Path $root -Directory -Recurse -Force -Include bin, obj, dist | ForEach-Object {
    Write-Host "Removing $($_.FullName)"
    Remove-Item $_.FullName -Recurse -Force
}

if ($Full) {
    $nodeModules = Join-Path $root "src\SectorForge.Web\node_modules"
    if (Test-Path $nodeModules) {
        Write-Host "Removing $nodeModules"
        Remove-Item $nodeModules -Recurse -Force
    }
}
