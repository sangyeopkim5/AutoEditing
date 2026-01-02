# Premiere Pro Remote Project Creator - PowerShell Trigger
# Usage: .\trigger.ps1 [-ProjectName "MyProject"] [-SequenceName "Main"]

param(
    [string]$ProjectName = "",
    [string]$SequenceName = ""
)

$ServerUrl = "http://localhost:3000"

Write-Host "=================================================="
Write-Host "Premiere Pro Remote Project Creator" -ForegroundColor Cyan
Write-Host "=================================================="
Write-Host ""

# Check server status
Write-Host "Checking server status..." -ForegroundColor Yellow
try {
    $status = Invoke-RestMethod -Uri "$ServerUrl/status" -Method Get -TimeoutSec 5
    Write-Host "  Connected plugins: $($status.connectedClients)" -ForegroundColor Green
    Write-Host "  Save path: $($status.defaultSavePath)" -ForegroundColor Gray
    
    if ($status.connectedClients -eq 0) {
        Write-Host ""
        Write-Host "ERROR: No connected Premiere Pro plugin!" -ForegroundColor Red
        Write-Host "  1. Run Premiere Pro" -ForegroundColor Yellow
        Write-Host "  2. Load the plugin via UDT" -ForegroundColor Yellow
        exit 1
    }
}
catch {
    Write-Host "ERROR: Cannot connect to server" -ForegroundColor Red
    Write-Host "  Start the server first:" -ForegroundColor Yellow
    Write-Host "  cd server; npm start" -ForegroundColor Gray
    exit 1
}

Write-Host ""

# Build request body
$body = @{}
if ($ProjectName) { $body["projectName"] = $ProjectName }
if ($SequenceName) { $body["sequenceName"] = $SequenceName }

Write-Host "Creating project..." -ForegroundColor Yellow
if ($body.Count -gt 0) {
    Write-Host "  Data: $($body | ConvertTo-Json -Compress)" -ForegroundColor Gray
}

try {
    $jsonBody = $body | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$ServerUrl/create-project" -Method Post -Body $jsonBody -ContentType "application/json" -TimeoutSec 60
    
    if ($response.success) {
        Write-Host ""
        Write-Host "SUCCESS!" -ForegroundColor Green
        Write-Host "  Name: $($response.projectName)" -ForegroundColor White
        Write-Host "  Path: $($response.projectPath)" -ForegroundColor Gray
    }
    else {
        Write-Host ""
        Write-Host "FAILED: $($response.error)" -ForegroundColor Red
        exit 1
    }
}
catch {
    Write-Host ""
    Write-Host "Request failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
