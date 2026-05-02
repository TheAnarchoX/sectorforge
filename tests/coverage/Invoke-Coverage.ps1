param(
    [string]$OutputRoot = "",
    [string]$ThresholdConfigPath = "",
    [switch]$NoRestore,
    [switch]$SkipThresholds
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\.." )).Path

if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $root "artifacts\coverage"
}

if ([string]::IsNullOrWhiteSpace($ThresholdConfigPath)) {
    $ThresholdConfigPath = Join-Path $PSScriptRoot "coverage-thresholds.json"
}

$projectCoverageRoot = Join-Path $OutputRoot "projects"
$reportRoot = Join-Path $OutputRoot "report"
$testProjects = @(
    @{ Name = "core"; Path = Join-Path $root "tests\SectorForge.Core.Tests\SectorForge.Core.Tests.csproj" },
    @{ Name = "protocol"; Path = Join-Path $root "tests\SectorForge.Protocol.Tests\SectorForge.Protocol.Tests.csproj" },
    @{ Name = "api"; Path = Join-Path $root "tests\SectorForge.Api.Tests\SectorForge.Api.Tests.csproj" }
)

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

function Get-LineCoveragePercent {
    param($Entry)

    if ($Entry.Valid -eq 0) {
        return 100.0
    }

    return [math]::Round(($Entry.Covered / $Entry.Valid) * 100, 2)
}

function Get-CoverageByFile {
    param([xml]$CoverageXml)

    $coverageByFile = @{}

    foreach ($packageNode in @($CoverageXml.coverage.packages.package)) {
        foreach ($classNode in @($packageNode.classes.class)) {
            $fileName = [string]$classNode.filename
            if ([string]::IsNullOrWhiteSpace($fileName)) {
                continue
            }

            $normalizedFileName = $fileName.Replace('/', '\')
            if (-not $coverageByFile.ContainsKey($normalizedFileName)) {
                $coverageByFile[$normalizedFileName] = [ordered]@{
                    Covered = 0
                    Valid = 0
                }
            }

            foreach ($lineNode in @($classNode.lines.line)) {
                $coverageByFile[$normalizedFileName].Valid += 1
                if ([int]$lineNode.hits -gt 0) {
                    $coverageByFile[$normalizedFileName].Covered += 1
                }
            }
        }
    }

    return $coverageByFile
}

function Get-CoverageEntryForPath {
    param(
        [hashtable]$CoverageByFile,
        [string]$PathSuffix
    )

    $normalizedSuffix = $PathSuffix.Replace('/', '\')
    $matches = @($CoverageByFile.Keys | Where-Object { $_.EndsWith($normalizedSuffix, [System.StringComparison]::OrdinalIgnoreCase) })

    if ($matches.Count -eq 0) {
        throw "No coverage entry matched path suffix '$PathSuffix'."
    }

    $aggregate = [ordered]@{
        Covered = 0
        Valid = 0
    }

    foreach ($match in $matches) {
        $aggregate.Covered += $CoverageByFile[$match].Covered
        $aggregate.Valid += $CoverageByFile[$match].Valid
    }

    return $aggregate
}

function Write-LowCoverageSummary {
    param([hashtable]$CoverageByFile)

    $lowestCoverage = $CoverageByFile.GetEnumerator() |
        ForEach-Object {
            [pscustomobject]@{
                File = $_.Key.Replace('\', '/')
                LineCoverage = Get-LineCoveragePercent $_.Value
            }
        } |
        Sort-Object LineCoverage, File |
        Select-Object -First 10

    Write-Host ""
    Write-Host "Lowest covered files:" -ForegroundColor Cyan
    foreach ($entry in $lowestCoverage) {
        Write-Host ("  {0,6:N2}%  {1}" -f $entry.LineCoverage, $entry.File)
    }
}

if (Test-Path $OutputRoot) {
    Remove-Item -Path $OutputRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $projectCoverageRoot -Force | Out-Null
New-Item -ItemType Directory -Path $reportRoot -Force | Out-Null

Push-Location $root

try {
    foreach ($project in $testProjects) {
        $projectOutputDirectory = Join-Path $projectCoverageRoot $project.Name
        New-Item -ItemType Directory -Path $projectOutputDirectory -Force | Out-Null

        $testArguments = @(
            "test",
            $project.Path,
            "--nologo",
            "/p:CollectCoverage=true",
            "/p:CoverletOutputFormat=cobertura",
            "/p:CoverletOutput=$([IO.Path]::Combine($projectOutputDirectory, 'coverage'))"
        )

        if ($NoRestore) {
            $testArguments += "--no-restore"
        }

        Invoke-NativeCommand -Command "dotnet" -Arguments $testArguments
    }

    Invoke-NativeCommand -Command "dotnet" -Arguments @("tool", "restore")

    $coverageFiles = @(Get-ChildItem -Path $projectCoverageRoot -Filter "coverage.cobertura.xml" -Recurse | Select-Object -ExpandProperty FullName)
    if ($coverageFiles.Count -eq 0) {
        throw "Coverage files were not generated."
    }

    Invoke-NativeCommand -Command "dotnet" -Arguments @(
        "tool",
        "run",
        "reportgenerator",
        "-reports:$($coverageFiles -join ';')",
        "-targetdir:$reportRoot",
        "-reporttypes:Cobertura;Html;TextSummary",
        "-assemblyfilters:+SectorForge.*;-*.Tests"
    )

    $mergedCoveragePath = Join-Path $reportRoot "Cobertura.xml"
    if (-not (Test-Path $mergedCoveragePath)) {
        throw "Merged coverage report was not generated at $mergedCoveragePath."
    }

    [xml]$mergedCoverage = Get-Content -Path $mergedCoveragePath
    $overallLineCoverage = [math]::Round(([double]$mergedCoverage.coverage.'line-rate') * 100, 2)
    $overallBranchCoverage = [math]::Round(([double]$mergedCoverage.coverage.'branch-rate') * 100, 2)
    $coverageByFile = Get-CoverageByFile -CoverageXml $mergedCoverage

    Write-Host ""
    Write-Host "Coverage summary:" -ForegroundColor Cyan
    Write-Host ("  Overall line coverage:   {0:N2}%" -f $overallLineCoverage)
    Write-Host ("  Overall branch coverage: {0:N2}%" -f $overallBranchCoverage)
    Write-LowCoverageSummary -CoverageByFile $coverageByFile

    if (-not $SkipThresholds -and (Test-Path $ThresholdConfigPath)) {
        $thresholdConfig = Get-Content -Path $ThresholdConfigPath -Raw | ConvertFrom-Json
        $failures = [System.Collections.Generic.List[string]]::new()

        $minimumOverallLineCoverage = [double]$thresholdConfig.overallLineCoverageMinimum
        if ($overallLineCoverage -lt $minimumOverallLineCoverage) {
            $failures.Add(("Overall line coverage {0:N2}% is below the configured minimum of {1:N2}%." -f $overallLineCoverage, $minimumOverallLineCoverage))
        }

        foreach ($fileThreshold in @($thresholdConfig.criticalFiles.PSObject.Properties)) {
            $coverageEntry = Get-CoverageEntryForPath -CoverageByFile $coverageByFile -PathSuffix $fileThreshold.Name
            $lineCoverage = Get-LineCoveragePercent -Entry $coverageEntry
            $minimumLineCoverage = [double]$fileThreshold.Value

            if ($lineCoverage -lt $minimumLineCoverage) {
                $failures.Add(("{0} line coverage {1:N2}% is below the configured minimum of {2:N2}%." -f $fileThreshold.Name, $lineCoverage, $minimumLineCoverage))
            }
        }

        if ($failures.Count -gt 0) {
            foreach ($failure in $failures) {
                Write-Host $failure -ForegroundColor Red
            }

            throw "Coverage thresholds were not met."
        }
    }
}
finally {
    Pop-Location
}
