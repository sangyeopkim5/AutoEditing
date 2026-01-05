# Premiere Pro Remote Project Creator - PowerShell Trigger
# Usage: .\trigger.ps1 [-ProjectName "MyProject"] [-SequenceName "Timeline"] [-PresetName "Preset"]

param(
    [string]$ProjectName = "",
    [string]$SequenceName = "",
    [string]$PresetName = ""
)

$ServerUrl = "http://localhost:3000"

Write-Host "=================================================="
Write-Host "Premiere Pro Remote Project Creator v2.0" -ForegroundColor Cyan
Write-Host "=================================================="
Write-Host ""

# Check server status
Write-Host "Checking server status..." -ForegroundColor Yellow
try {
    $status = Invoke-RestMethod -Uri "$ServerUrl/status" -Method Get -TimeoutSec 5
    Write-Host "  Connected plugins: $($status.connectedClients)" -ForegroundColor Green
    Write-Host "  Save path: $($status.defaultSavePath)" -ForegroundColor Gray
    Write-Host "  Default preset: $($status.defaultPreset)" -ForegroundColor Gray
    Write-Host "  Default sequence: $($status.defaultSequence)" -ForegroundColor Gray
    
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
if ($PresetName) { $body["presetName"] = $PresetName }

Write-Host "Creating project with sequence..." -ForegroundColor Yellow
if ($body.Count -gt 0) {
    Write-Host "  Custom settings: $($body | ConvertTo-Json -Compress)" -ForegroundColor Gray
}

try {
    $jsonBody = $body | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$ServerUrl/create-project" -Method Post -Body $jsonBody -ContentType "application/json" -TimeoutSec 60
    
    if ($response.success) {
        Write-Host ""
        Write-Host "SUCCESS!" -ForegroundColor Green
        Write-Host "  Project: $($response.projectName)" -ForegroundColor White
        Write-Host "  Sequence: $($response.sequenceName)" -ForegroundColor White
        Write-Host "  Preset: $($response.presetUsed)" -ForegroundColor Cyan
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
