# Check for Administrative privileges
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Warning "Please run this script as Administrator!"
    Pause
    Exit
}

Write-Host "--- CCTV Dashboard Installer ---" -ForegroundColor Cyan

# Check for Docker
if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker not found. Installing Docker Desktop via Winget..." -ForegroundColor Yellow
    winget install -e --id Docker.DockerDesktop
    Write-Host "Docker installation initiated. Please complete the setup and restart this script." -ForegroundColor Green
    Pause
    Exit
}

# Verify Docker is running
docker ps >$null 2>&1
if ($LastExitCode -ne 0) {
    Write-Host "Docker is installed but not running. Please start Docker Desktop and try again." -ForegroundColor Red
    Pause
    Exit
}

# Check for docker-compose.yml
if (!(Test-Path "docker-compose.yml")) {
    Write-Host "Error: docker-compose.yml not found in current directory." -ForegroundColor Red
    Pause
    Exit
}

Write-Host "Starting CCTV Monitoring Services..." -ForegroundColor Cyan
docker-compose up -d --build

Write-Host "`n--- Installation Complete! ---" -ForegroundColor Green
Write-Host "Dashboard Available at: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Press any key to exit..."
[void][System.Console]::ReadKey($true)
