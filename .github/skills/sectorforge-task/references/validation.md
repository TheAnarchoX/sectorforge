# Validation Commands

Use the smallest meaningful check set for the task.

## Full Baseline

```powershell
.\tools\verify.ps1
```

The verify script runs backend tests, .NET format verification, frontend lint, and frontend build.

## Backend

```powershell
dotnet test .\src\SectorForge.slnx
dotnet format .\src\SectorForge.slnx --verify-no-changes
```

## Frontend

```powershell
npx --yes pnpm@latest --dir .\src\SectorForge.Web lint
npx --yes pnpm@latest --dir .\src\SectorForge.Web build
```

## Runtime Smoke Test

```powershell
.\tools\dev.ps1
```

Then open `http://localhost:5173` and confirm the API at `http://localhost:5221/api/health` returns JSON with `status` set to `ok`.
