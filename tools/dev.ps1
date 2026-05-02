param(
    [int]$ApiPort = 5221,
    [int]$WebPort = 5173,
    [switch]$NoInstall
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

function Test-LoopbackPortInUse {
    param([int]$Port)

    $hosts = @([System.Net.IPAddress]::Loopback)

    if ([System.Net.Sockets.Socket]::OSSupportsIPv6) {
        $hosts += [System.Net.IPAddress]::IPv6Loopback
    }

    foreach ($hostAddress in $hosts) {
        $client = [System.Net.Sockets.TcpClient]::new($hostAddress.AddressFamily)

        try {
            $connectTask = $client.ConnectAsync($hostAddress, $Port)

            if ($connectTask.Wait(200) -and $client.Connected) {
                return $true
            }
        }
        catch [System.ArgumentException] {
            continue
        }
        catch [System.AggregateException] {
            continue
        }
        catch [System.Net.Sockets.SocketException] {
            continue
        }
        finally {
            $client.Dispose()
        }
    }

    return $false
}

function Assert-PortAvailable {
    param(
        [string]$Name,
        [int]$Port,
        [string]$SwitchName
    )

    if (Test-LoopbackPortInUse -Port $Port) {
        throw "$Name port $Port is already in use. Stop the process using it or rerun with -$SwitchName <port>."
    }
}

if ($ApiPort -eq $WebPort) {
    throw "API and web ports are both set to $ApiPort. Choose distinct ports with -ApiPort <port> or -WebPort <port>."
}

Assert-PortAvailable -Name "API" -Port $ApiPort -SwitchName "ApiPort"
Assert-PortAvailable -Name "Web" -Port $WebPort -SwitchName "WebPort"

foreach ($requiredCommand in @("dotnet", "node", "npx")) {
    if (-not (Get-Command $requiredCommand -ErrorAction SilentlyContinue)) {
        throw "Required command '$requiredCommand' was not found on PATH."
    }
}

if (-not $NoInstall -and -not (Test-Path (Join-Path $webProject "node_modules"))) {
    Write-Host "Installing frontend dependencies with pnpm..." -ForegroundColor Cyan
    Invoke-Pnpm -Arguments @("--dir", $webProject, "install")
}

Write-Host "Starting SectorForge API on http://localhost:$ApiPort" -ForegroundColor Green
Write-Host "Starting SectorForge Web on http://localhost:$WebPort" -ForegroundColor Green
Write-Host "Fake telemetry autostart is enabled." -ForegroundColor Green

$apiJob = Start-Job -Name "SectorForge.Api" -ScriptBlock {
    param($Root, $Port)
    Set-Location $Root
    $env:ASPNETCORE_URLS = "http://localhost:$Port"
    $env:ASPNETCORE_ENVIRONMENT = "Development"
    dotnet run --project .\src\SectorForge.Api\SectorForge.Api.csproj --no-launch-profile -- --Collector:AutoStart=true --Collector:AdapterId=fake
} -ArgumentList $root, $ApiPort

$webJob = Start-Job -Name "SectorForge.Web" -ScriptBlock {
    param($Root, $ApiPort, $WebPort)
    Set-Location $Root
    $env:VITE_API_BASE_URL = "http://localhost:$ApiPort"

    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        pnpm --dir .\src\SectorForge.Web dev --host localhost --port $WebPort
    }
    else {
        npx --yes pnpm@latest --dir .\src\SectorForge.Web dev --host localhost --port $WebPort
    }
} -ArgumentList $root, $ApiPort, $WebPort

try {
    Write-Host "Open http://localhost:$WebPort" -ForegroundColor Yellow
    Write-Host "Press Ctrl+C to stop both processes." -ForegroundColor DarkGray

    while ($true) {
        foreach ($job in @($apiJob, $webJob)) {
            Receive-Job $job | ForEach-Object { Write-Host "[$($job.Name)] $_" }

            if ($job.State -in @("Failed", "Stopped", "Completed")) {
                Receive-Job $job | ForEach-Object { Write-Host "[$($job.Name)] $_" }
                throw "$($job.Name) exited with state $($job.State)."
            }
        }

        Wait-Job -Job $apiJob, $webJob -Timeout 1 | Out-Null
    }
}
finally {
    Write-Host "Stopping SectorForge dev processes..." -ForegroundColor Yellow
    Stop-Job $apiJob, $webJob -ErrorAction SilentlyContinue
    Remove-Job $apiJob, $webJob -Force -ErrorAction SilentlyContinue
}
