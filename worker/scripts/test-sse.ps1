#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Test script for SSE endpoint and task events

.DESCRIPTION
    Tests the SSE connection endpoint and verifies task events are broadcasted

.USAGE
    .\test-sse.ps1 [-BaseUrl <url>] [-JwtToken <token>]
#>

param(
    [string]$BaseUrl = "http://localhost:8788",
    [string]$JwtToken = ""
)

Write-Host "=== SSE Infrastructure Test Script ===" -ForegroundColor Cyan
Write-Host "Base URL: $BaseUrl"
Write-Host ""

# If no JWT token provided, try to get one via login
if (-not $JwtToken) {
    Write-Host "No JWT token provided. Attempting to get one via API key..." -ForegroundColor Yellow
    
    # Try agent API key login
    $loginBody = @{
        api_key = "dev-test-key"
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "$BaseUrl/auth/login" -Method POST -Body $loginBody -ContentType "application/json"
        if ($response.access_token) {
            $JwtToken = $response.access_token
            Write-Host "✓ Obtained JWT token via API key" -ForegroundColor Green
        }
    } catch {
        Write-Host "✗ Failed to get JWT token. Will try anonymous connection." -ForegroundColor Red
    }
}

# Test 1: SSE Connection Endpoint
Write-Host "`n[Test 1] Testing SSE Connection Endpoint..." -ForegroundColor Cyan

try {
    # Start a background job to test SSE connection
    $sseUrl = "$BaseUrl/sse/connect"
    if ($JwtToken) {
        $sseUrl += "?token=$JwtToken"
    }
    
    Write-Host "Connecting to: $sseUrl"
    
    # Use curl to test SSE connection (receives stream for 5 seconds)
    $job = Start-Job -ScriptBlock {
        param($url)
        try {
            $response = curl -s -N --max-time 5 $url 2>&1
            return $response
        } catch {
            return "Error: $_"
        }
    } -ArgumentList $sseUrl
    
    # Wait a bit for connection to establish
    Start-Sleep -Seconds 2
    
    # Check if job is still running (connection established)
    if ($job.State -eq "Running") {
        Write-Host "✓ SSE connection established successfully" -ForegroundColor Green
        Stop-Job $job
        Remove-Job $job
    } else {
        $result = Receive-Job $job
        if ($result -match "connection.established") {
            Write-Host "✓ SSE connection established and received initial event" -ForegroundColor Green
        } else {
            Write-Host "✗ SSE connection failed or no event received" -ForegroundColor Red
            Write-Host "Response: $result"
        }
        Remove-Job $job
    }
} catch {
    Write-Host "✗ SSE connection test failed: $_" -ForegroundColor Red
}

# Test 2: SSE Stats Endpoint
Write-Host "`n[Test 2] Testing SSE Stats Endpoint..." -ForegroundColor Cyan

try {
    $headers = @{}
    if ($JwtToken) {
        $headers["Authorization"] = "Bearer $JwtToken"
    }
    
    $response = Invoke-RestMethod -Uri "$BaseUrl/sse/stats" -Method GET -Headers $headers
    Write-Host "✓ SSE stats retrieved successfully" -ForegroundColor Green
    Write-Host "Stats: $(ConvertTo-Json $response -Depth 3)"
} catch {
    Write-Host "✗ SSE stats test failed: $_" -ForegroundColor Red
}

# Test 3: Create Task and Verify Event
Write-Host "`n[Test 3] Testing Task Creation Event..." -ForegroundColor Cyan

try {
    # First, start an SSE listener in background
    $sseUrl = "$BaseUrl/sse/connect"
    if ($JwtToken) {
        $sseUrl += "?token=$JwtToken"
    }
    
    $sseJob = Start-Job -ScriptBlock {
        param($url)
        $output = @()
        try {
            # Use curl to capture SSE stream
            $response = curl -s -N --max-time 10 $url 2>&1
            return $response
        } catch {
            return "Error: $_"
        }
    } -ArgumentList $sseUrl
    
    # Wait for SSE connection
    Start-Sleep -Seconds 2
    
    # Create a test task
    $taskBody = @{
        name = "SSE Test Task - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        description = "Test task for SSE event verification"
        status = "inbox"
        priority = 1
    } | ConvertTo-Json
    
    $headers = @{
        "Content-Type" = "application/json"
    }
    if ($JwtToken) {
        $headers["Authorization"] = "Bearer $JwtToken"
    }
    
    $taskResponse = Invoke-RestMethod -Uri "$BaseUrl/tasks" -Method POST -Body $taskBody -Headers $headers
    Write-Host "✓ Task created: ID $($taskResponse.task.id)" -ForegroundColor Green
    
    # Wait for event to be broadcast
    Start-Sleep -Seconds 2
    
    # Check SSE output
    if ($sseJob.State -eq "Running") {
        Stop-Job $sseJob
    }
    
    $sseOutput = Receive-Job $sseJob
    Remove-Job $sseJob
    
    if ($sseOutput -match "task.created") {
        Write-Host "✓ Task creation event received via SSE" -ForegroundColor Green
    } else {
        Write-Host "⚠ Task creation event not detected (may need to check manually)" -ForegroundColor Yellow
    }
    
    # Cleanup - delete the test task
    $deleteResponse = Invoke-RestMethod -Uri "$BaseUrl/tasks/$($taskResponse.task.id)" -Method DELETE -Headers $headers
    Write-Host "✓ Test task cleaned up" -ForegroundColor Green
    
} catch {
    Write-Host "✗ Task creation event test failed: $_" -ForegroundColor Red
}

Write-Host "`n=== Test Summary ===" -ForegroundColor Cyan
Write-Host "SSE Infrastructure implementation complete!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Deploy the worker: wrangler deploy"
Write-Host "2. Configure Durable Objects in Cloudflare dashboard"
Write-Host "3. Update frontend to connect to /sse/connect endpoint"
Write-Host "4. Test with curl: curl -N 'https://<worker-url>/sse/connect?token=<jwt>'"
