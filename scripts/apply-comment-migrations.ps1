# Script to apply comment system migrations to D1 database
# Usage: .\apply-comment-migrations.ps1 [-Production]

param(
    [switch]$Production = $false
)

$ErrorActionPreference = "Stop"

Write-Host "🔄 Applying Comment System Migrations" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

$env:CLOUDFLARE_API_TOKEN = $env:CLOUDFLARE_API_TOKEN

if (-not $env:CLOUDFLARE_API_TOKEN) {
    Write-Error "❌ CLOUDFLARE_API_TOKEN environment variable is not set!"
    Write-Host "Please set it with: `$env:CLOUDFLARE_API_TOKEN = 'your-token'" -ForegroundColor Yellow
    exit 1
}

$databaseName = "openclaw-taskboard-db"
$workerDir = Join-Path $PSScriptRoot ".." "worker"

# Check if migrations exist
$commentsMigration = Join-Path $PSScriptRoot ".." "migrations" "004-add-task-comments.sql"
$countMigration = Join-Path $PSScriptRoot ".." "migrations" "add-comment-count.sql"

if (-not (Test-Path $commentsMigration)) {
    Write-Error "❌ Migration file not found: $commentsMigration"
    exit 1
}

if (-not (Test-Path $countMigration)) {
    Write-Error "❌ Migration file not found: $countMigration"
    exit 1
}

$remoteFlag = if ($Production) { "--remote" } else { "" }
$envFlag = if ($Production) { "production" } else { "staging" }

Write-Host "`n🎯 Target Environment: $envFlag" -ForegroundColor Green
Write-Host "📁 Database: $databaseName" -ForegroundColor Green
Write-Host "`n"

# Step 1: Apply comments tables migration
Write-Host "Step 1: Creating comments tables..." -ForegroundColor Cyan
Push-Location $workerDir
try {
    $cmd = "npx wrangler d1 execute $databaseName $remoteFlag --file=`"$commentsMigration`""
    Write-Host "Executing: $cmd" -ForegroundColor DarkGray
    Invoke-Expression $cmd
    if ($LASTEXITCODE -ne 0) { throw "Migration failed" }
    Write-Host "✅ Comments tables created successfully!" -ForegroundColor Green
} catch {
    Write-Warning "⚠️  Step 1 may have failed (tables might already exist): $_"
} finally {
    Pop-Location
}

Write-Host "`n"

# Step 2: Apply comment_count column migration
Write-Host "Step 2: Adding comment_count column to tasks table..." -ForegroundColor Cyan
Push-Location $workerDir
try {
    $cmd = "npx wrangler d1 execute $databaseName $remoteFlag --file=`"$countMigration`""
    Write-Host "Executing: $cmd" -ForegroundColor DarkGray
    Invoke-Expression $cmd
    if ($LASTEXITCODE -ne 0) { throw "Migration failed" }
    Write-Host "✅ comment_count column added successfully!" -ForegroundColor Green
} catch {
    Write-Warning "⚠️  Step 2 may have failed (column might already exist): $_"
} finally {
    Pop-Location
}

Write-Host "`n"
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "✅ Migration process completed!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan

# Step 3: Verify the migration
Write-Host "`nStep 3: Verifying database schema..." -ForegroundColor Cyan
Push-Location $workerDir
try {
    $verifyCmd = "npx wrangler d1 execute $databaseName $remoteFlag --command=`"PRAGMA table_info(tasks)`""
    $result = Invoke-Expression $verifyCmd | Out-String
    
    if ($result -match "comment_count") {
        Write-Host "✅ Verification PASSED: comment_count column exists!" -ForegroundColor Green
    } else {
        Write-Error "❌ Verification FAILED: comment_count column not found!"
        exit 1
    }
} finally {
    Pop-Location
}

Write-Host "`nAll migrations applied successfully!" -ForegroundColor Green
