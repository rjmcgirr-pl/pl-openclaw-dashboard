# log-cron.ps1 - PowerShell helper for logging cron job runs to the taskboard API
# Usage: . .\scripts\log-cron.ps1
#        Start-CronJob -Id 1 -Token $jwtToken
#        # ... run your cron job ...
#        Stop-CronJob -Id 1 -Status "done" -Output "Job completed successfully" -Token $jwtToken

param(
    [string]$ConfigPath = "$PSScriptRoot\..\cron-config.json"
)

# Default configuration
$script:DefaultApiUrl = $env:CRON_API_URL
$script:DefaultToken = $env:CRON_API_TOKEN
$script:DefaultUsername = $env:CRON_API_USERNAME
$script:DefaultPassword = $env:CRON_API_PASSWORD

# Load config file if exists
if (Test-Path $ConfigPath) {
    $config = Get-Content $ConfigPath | ConvertFrom-Json
    if ($config.apiUrl) { $script:DefaultApiUrl = $config.apiUrl }
    if ($config.token) { $script:DefaultToken = $config.token }
    if ($config.username) { $script:DefaultUsername = $config.username }
    if ($config.password) { $script:DefaultPassword = $config.password }
}

<#
.SYNOPSIS
    Gets a JWT token for taskboard API authentication.
.DESCRIPTION
    Authenticates with the taskboard API and returns a JWT token.
.PARAMETER ApiUrl
    The taskboard API URL (optional, uses env/config default).
.PARAMETER Username
    The username for authentication.
.PARAMETER Password
    The password for authentication.
.EXAMPLE
    $token = Get-JwtToken -Username "admin@taskboard.local" -Password "secret123"
#>
function Get-JwtToken {
    param(
        [string]$ApiUrl = $script:DefaultApiUrl,
        
        [string]$Username = $script:DefaultUsername,
        
        [string]$Password = $script:DefaultPassword
    )
    
    if (-not $ApiUrl) {
        throw "API URL not configured. Set CRON_API_URL environment variable or provide -ApiUrl parameter."
    }
    
    if (-not $Username -or -not $Password) {
        throw "Username and password required. Set CRON_API_USERNAME and CRON_API_PASSWORD environment variables."
    }
    
    $body = @{username=$Username; password=$Password} | ConvertTo-Json
    $headers = @{'Content-Type'='application/json'}
    
    try {
        $response = Invoke-RestMethod -Uri "$ApiUrl/auth/login" -Method POST -Body $body -Headers $headers
        return $response.token
    } catch {
        throw "Failed to get JWT token: $($_.Exception.Message)"
    }
}

<#
.SYNOPSIS
    Starts a cron job by calling the taskboard API.
.DESCRIPTION
    Marks a cron job as running and creates a new run record.
.PARAMETER Id
    The cron job ID.
.PARAMETER ApiUrl
    The taskboard API URL (optional, uses env/config default).
.PARAMETER Token
    The JWT Bearer token for authentication.
.PARAMETER Username
    The username for JWT authentication (alternative to Token).
.PARAMETER Password
    The password for JWT authentication (alternative to Token).
.PARAMETER MaxRetries
    Maximum number of retry attempts (default: 3).
.PARAMETER RetryDelaySec
    Seconds to wait between retries (default: 5).
.EXAMPLE
    Start-CronJob -Id 1 -Token $jwtToken
.EXAMPLE
    Start-CronJob -Id 1 -Username "admin@taskboard.local" -Password "secret123"
#>
function Start-CronJob {
    param(
        [Parameter(Mandatory=$true)]
        [int]$Id,
        
        [string]$ApiUrl = $script:DefaultApiUrl,
        
        [string]$Token = $script:DefaultToken,
        
        [string]$Username = $script:DefaultUsername,
        
        [string]$Password = $script:DefaultPassword,
        
        [int]$MaxRetries = 3,
        
        [int]$RetryDelaySec = 5
    )
    
    if (-not $ApiUrl) {
        throw "API URL not configured. Set CRON_API_URL environment variable or provide -ApiUrl parameter."
    }
    
    # Get token if not provided but credentials are
    if (-not $Token -and $Username -and $Password) {
        $Token = Get-JwtToken -ApiUrl $ApiUrl -Username $Username -Password $Password
    }
    
    if (-not $Token) {
        throw "JWT token required. Set CRON_API_TOKEN environment variable, provide -Token parameter, or provide -Username and -Password for authentication."
    }
    
    $url = "$ApiUrl/cron-jobs/$Id/start"
    $headers = @{
        'Content-Type' = 'application/json'
        'Authorization' = "Bearer $Token"
    }
    
    $attempt = 0
    $lastError = $null
    
    while ($attempt -lt $MaxRetries) {
        $attempt++
        
        try {
            $response = Invoke-RestMethod -Uri $url -Method POST -Headers $headers -ErrorAction Stop
            Write-Host "✅ Cron job $Id started successfully" -ForegroundColor Green
            return $response
        }
        catch {
            $lastError = $_
            Write-Warning "Attempt $attempt failed: $($_.Exception.Message)"
            
            if ($attempt -lt $MaxRetries) {
                Write-Host "Waiting $RetryDelaySec seconds before retry..." -ForegroundColor Yellow
                Start-Sleep -Seconds $RetryDelaySec
            }
        }
    }
    
    throw "Failed to start cron job after $MaxRetries attempts. Last error: $($lastError.Exception.Message)"
}

<#
.SYNOPSIS
    Ends a cron job by calling the taskboard API.
.DESCRIPTION
    Marks a cron job as done or error with optional output.
.PARAMETER Id
    The cron job ID.
.PARAMETER Status
    The final status: 'done' or 'error'.
.PARAMETER Output
    Optional output/log message from the job.
.PARAMETER ApiUrl
    The taskboard API URL (optional, uses env/config default).
.PARAMETER Token
    The JWT Bearer token for authentication.
.PARAMETER Username
    The username for JWT authentication (alternative to Token).
.PARAMETER Password
    The password for JWT authentication (alternative to Token).
.PARAMETER MaxRetries
    Maximum number of retry attempts (default: 3).
.PARAMETER RetryDelaySec
    Seconds to wait between retries (default: 5).
.EXAMPLE
    Stop-CronJob -Id 1 -Status "done" -Output "Backup completed successfully" -Token $jwtToken
.EXAMPLE
    Stop-CronJob -Id 1 -Status "error" -Output "Failed to connect to database" -Token $jwtToken
#>
function Stop-CronJob {
    param(
        [Parameter(Mandatory=$true)]
        [int]$Id,
        
        [Parameter(Mandatory=$true)]
        [ValidateSet('done', 'error')]
        [string]$Status,
        
        [string]$Output = "",
        
        [string]$ApiUrl = $script:DefaultApiUrl,
        
        [string]$Token = $script:DefaultToken,
        
        [string]$Username = $script:DefaultUsername,
        
        [string]$Password = $script:DefaultPassword,
        
        [int]$MaxRetries = 3,
        
        [int]$RetryDelaySec = 5
    )
    
    if (-not $ApiUrl) {
        throw "API URL not configured. Set CRON_API_URL environment variable or provide -ApiUrl parameter."
    }
    
    # Get token if not provided but credentials are
    if (-not $Token -and $Username -and $Password) {
        $Token = Get-JwtToken -ApiUrl $ApiUrl -Username $Username -Password $Password
    }
    
    if (-not $Token) {
        throw "JWT token required. Set CRON_API_TOKEN environment variable, provide -Token parameter, or provide -Username and -Password for authentication."
    }
    
    $url = "$ApiUrl/cron-jobs/$Id/end"
    $headers = @{
        'Content-Type' = 'application/json'
        'Authorization' = "Bearer $Token"
    }
    
    $body = @{
        status = $Status
        output = $Output
    } | ConvertTo-Json
    
    $attempt = 0
    $lastError = $null
    
    while ($attempt -lt $MaxRetries) {
        $attempt++
        
        try {
            $response = Invoke-RestMethod -Uri $url -Method POST -Headers $headers -Body $body -ErrorAction Stop
            
            if ($Status -eq 'done') {
                Write-Host "✅ Cron job $Id completed successfully" -ForegroundColor Green
            } else {
                Write-Host "❌ Cron job $Id failed" -ForegroundColor Red
            }
            
            return $response
        }
        catch {
            $lastError = $_
            Write-Warning "Attempt $attempt failed: $($_.Exception.Message)"
            
            if ($attempt -lt $MaxRetries) {
                Write-Host "Waiting $RetryDelaySec seconds before retry..." -ForegroundColor Yellow
                Start-Sleep -Seconds $RetryDelaySec
            }
        }
    }
    
    throw "Failed to stop cron job after $MaxRetries attempts. Last error: $($lastError.Exception.Message)"
}

<#
.SYNOPSIS
    Gets all cron jobs from the taskboard API.
.DESCRIPTION
    Retrieves the list of all cron jobs with their current status.
.PARAMETER ApiUrl
    The taskboard API URL (optional, uses env/config default).
.PARAMETER Token
    The JWT Bearer token for authentication.
.PARAMETER Username
    The username for JWT authentication (alternative to Token).
.PARAMETER Password
    The password for JWT authentication (alternative to Token).
.EXAMPLE
    Get-CronJobs -Token $jwtToken
.EXAMPLE
    Get-CronJobs -Username "admin@taskboard.local" -Password "secret123"
#>
function Get-CronJobs {
    param(
        [string]$ApiUrl = $script:DefaultApiUrl,
        
        [string]$Token = $script:DefaultToken,
        
        [string]$Username = $script:DefaultUsername,
        
        [string]$Password = $script:DefaultPassword
    )
    
    if (-not $ApiUrl) {
        throw "API URL not configured. Set CRON_API_URL environment variable or provide -ApiUrl parameter."
    }
    
    # Get token if not provided but credentials are
    if (-not $Token -and $Username -and $Password) {
        $Token = Get-JwtToken -ApiUrl $ApiUrl -Username $Username -Password $Password
    }
    
    if (-not $Token) {
        throw "JWT token required. Set CRON_API_TOKEN environment variable, provide -Token parameter, or provide -Username and -Password for authentication."
    }
    
    $url = "$ApiUrl/cron-jobs"
    $headers = @{
        'Authorization' = "Bearer $Token"
    }
    
    try {
        $response = Invoke-RestMethod -Uri $url -Method GET -Headers $headers -ErrorAction Stop
        return $response.cronJobs
    }
    catch {
        throw "Failed to get cron jobs: $($_.Exception.Message)"
    }
}

<#
.SYNOPSIS
    Runs a script block with automatic cron job logging.
.DESCRIPTION
    Wraps a script block with Start-CronJob and Stop-CronJob calls for automatic logging.
.PARAMETER Id
    The cron job ID.
.PARAMETER ScriptBlock
    The script block to execute.
.PARAMETER ApiUrl
    The taskboard API URL (optional).
.PARAMETER Token
    The JWT Bearer token for authentication.
.PARAMETER Username
    The username for JWT authentication (alternative to Token).
.PARAMETER Password
    The password for JWT authentication (alternative to Token).
.EXAMPLE
    Invoke-CronJob -Id 1 -Token $jwtToken -ScriptBlock {
        # Your cron job code here
        Get-Process | Export-Csv "processes.csv"
    }
#>
function Invoke-CronJob {
    param(
        [Parameter(Mandatory=$true)]
        [int]$Id,
        
        [Parameter(Mandatory=$true)]
        [scriptblock]$ScriptBlock,
        
        [string]$ApiUrl = $script:DefaultApiUrl,
        
        [string]$Token = $script:DefaultToken,
        
        [string]$Username = $script:DefaultUsername,
        
        [string]$Password = $script:DefaultPassword
    )
    
    # Start the cron job
    Start-CronJob -Id $Id -ApiUrl $ApiUrl -Token $Token -Username $Username -Password $Password
    
    $output = @()
    $success = $false
    
    try {
        # Capture output
        $result = & $ScriptBlock 2>&1
        $output = $result | ForEach-Object { $_.ToString() }
        $success = $true
    }
    catch {
        $output += "ERROR: $($_.Exception.Message)"
        $output += $_.ScriptStackTrace
        $success = $false
    }
    
    # Format output
    $outputString = $output -join "`n"
    if ($outputString.Length -gt 4000) {
        $outputString = $outputString.Substring(0, 4000) + "`n... [truncated]"
    }
    
    # End the cron job
    $status = if ($success) { 'done' } else { 'error' }
    Stop-CronJob -Id $Id -Status $status -Output $outputString -ApiUrl $ApiUrl -Token $Token -Username $Username -Password $Password
    
    return $success
}

# Export functions
Export-ModuleMember -Function Get-JwtToken, Start-CronJob, Stop-CronJob, Get-CronJobs, Invoke-CronJob

# If script is dot-sourced, print help
if ($MyInvocation.InvocationName -eq '.') {
    Write-Host "`n📋 Cron Job Logging Helper Loaded`n" -ForegroundColor Cyan
    Write-Host "Available functions:" -ForegroundColor Yellow
    Write-Host "  Get-JwtToken    - Get a JWT Bearer token from the API"
    Write-Host "  Start-CronJob   - Mark a cron job as started"
    Write-Host "  Stop-CronJob    - Mark a cron job as done/error"
    Write-Host "  Get-CronJobs    - List all cron jobs"
    Write-Host "  Invoke-CronJob  - Run a script block with auto-logging`n"
    Write-Host "Configuration (environment variables):" -ForegroundColor Yellow
    Write-Host "  CRON_API_URL      - The taskboard API URL"
    Write-Host "  CRON_API_TOKEN    - JWT Bearer token (optional)"
    Write-Host "  CRON_API_USERNAME - Username for JWT auth"
    Write-Host "  CRON_API_PASSWORD - Password for JWT auth`n"
}
