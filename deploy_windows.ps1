# deploy_windows.ps1

# Check for Administrative privileges
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Warning "Please run this script as Administrator!"
    Pause
    Exit
}

$ErrorActionPreference = "Stop"

# --- Configuration ---
$BASE_DIR = "C:\CampusWatch"
$BACKEND_JAR = "cctv-backend.jar"
$UI_BUILD_DIR = "build"
$NGINX_VERSION = "1.24.0"
$MEDIAMTX_VERSION = "1.6.0"

# --- IP Address Detection ---
Write-Host "Detecting Host IP Address..." -ForegroundColor Cyan
try {
    # Get the first non-loopback, non-virtual IPv4 address (sorting by metric usually gives the primary interface)
    $HostIP = (
        Get-NetIPAddress -AddressFamily IPv4 | 
        Where-Object { 
            $_.InterfaceAlias -notlike "*Loopback*" -and 
            $_.InterfaceAlias -notlike "*WSL*" -and 
            $_.InterfaceAlias -notlike "*Default Switch*" -and
            $_.PrefixOrigin -ne "WellKnown" # Exclude APIPA (169.254.x.x) if possible, though 'Manual' or 'Dhcp' is better check
        } | 
        Sort-Object -Property InterfaceMetric | 
        Select-Object -ExpandProperty IPAddress -First 1
    )
    
    if ([string]::IsNullOrWhiteSpace($HostIP)) {
        throw "Could not detect a valid IPv4 address."
    }
    Write-Host "Detected Source IP: $HostIP" -ForegroundColor Green
} catch {
    Write-Warning "Failed to auto-detect IP address. using 127.0.0.1. Please update mediamtx.yml manually."
    $HostIP = "127.0.0.1"
}

Write-Host "--- Campus Watch Windows Installer ---" -ForegroundColor Cyan

# --- 1. Prerequisites Check ---

# Check Java
if (!(Get-Command java -ErrorAction SilentlyContinue)) {
    Write-Host "Java not found. Installing OpenJDK 17..." -ForegroundColor Yellow
    winget install -e --id Microsoft.OpenJDK.17
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install Java. Please install JDK 17 manually."
    }
    # Refresh env vars for current session might differ, warn user
    Write-Warning "Java installed. You may need to restart the script/terminal for changes to take effect."
} else {
    Write-Host "Java is already installed." -ForegroundColor Green
}

# --- 2. Directory Setup ---
Write-Host "Setting up directories at $BASE_DIR..." -ForegroundColor Cyan

if (!(Test-Path $BASE_DIR)) { New-Item -ItemType Directory -Force -Path $BASE_DIR | Out-Null }
$DIRS = @("bin", "ui", "nginx", "mediamtx", "logs", "temp")
foreach ($dir in $DIRS) {
    $path = Join-Path $BASE_DIR $dir
    if (!(Test-Path $path)) { New-Item -ItemType Directory -Force -Path $path | Out-Null }
}

# --- 3. Artifact Installation ---
Write-Host "Copying application files..." -ForegroundColor Cyan

# Copy Backend
if (Test-Path $BACKEND_JAR) {
    Copy-Item -Path $BACKEND_JAR -Destination (Join-Path $BASE_DIR "bin\$BACKEND_JAR") -Force
    Write-Host "Backend JAR copied." -ForegroundColor Green
} else {
    Write-Warning "File '$BACKEND_JAR' not found in current directory. Please copy it to '$BASE_DIR\bin' manually."
}

# Copy UI
if (Test-Path $UI_BUILD_DIR) {
    Copy-Item -Path "$UI_BUILD_DIR\*" -Destination (Join-Path $BASE_DIR "ui") -Recurse -Force
    Write-Host "UI Build copied." -ForegroundColor Green
} else {
    Write-Warning "Directory '$UI_BUILD_DIR' not found. Please copy build files to '$BASE_DIR\ui' manually."
}

# --- 4. Component Setup ---

# Nginx Setup
$NGINX_DIR = Join-Path $BASE_DIR "nginx"
if (!(Test-Path "$NGINX_DIR\nginx.exe")) {
    Write-Host "Downloading Nginx..." -ForegroundColor Cyan
    $nginxZip = "$env:TEMP\nginx.zip"
    Invoke-WebRequest -Uri "https://nginx.org/download/nginx-$NGINX_VERSION.zip" -OutFile $nginxZip
    
    Write-Host "Extracting Nginx..."
    Expand-Archive -Path $nginxZip -DestinationPath "$env:TEMP\nginx_extract" -Force
    
    # Move contents to final dir (handling the version folder inside zip)
    Copy-Item -Path "$env:TEMP\nginx_extract\nginx-$NGINX_VERSION\*" -Destination $NGINX_DIR -Recurse -Force
    Remove-Item $nginxZip -Force
    Remove-Item "$env:TEMP\nginx_extract" -Recurse -Force
    Write-Host "Nginx installed." -ForegroundColor Green
}

# Create Nginx Config
Write-Host "Configuring Nginx..."
$nginxConfContent = @"
worker_processes  1;

events {
    worker_connections  1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile        on;
    keepalive_timeout  65;

    server {
        listen       80;
        server_name  localhost;

        location / {
            root   "$BASE_DIR\ui";
            index  index.html index.htm;
            try_files `$uri `$uri/ /index.html;
        }

        location /api/ {
            proxy_pass http://127.0.0.1:8080/api/;
            proxy_set_header Host `$host;
            proxy_set_header X-Real-IP `$remote_addr;
            proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
        }
        
        # Prevent caching for sensitive data/streams if needed
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
"@
Set-Content -Path "$NGINX_DIR\conf\nginx.conf" -Value $nginxConfContent

# MediaMTX Setup
$MEDIAMTX_DIR = Join-Path $BASE_DIR "mediamtx"
if (!(Test-Path "$MEDIAMTX_DIR\mediamtx.exe")) {
    Write-Host "Downloading MediaMTX..." -ForegroundColor Cyan
    $mtxZip = "$env:TEMP\mediamtx.zip"
    # Note: URL assumes windows_amd64. Adjust if needed.
    Invoke-WebRequest -Uri "https://github.com/bluenviron/mediamtx/releases/download/v${MEDIAMTX_VERSION}/mediamtx_v${MEDIAMTX_VERSION}_windows_amd64.zip" -OutFile $mtxZip
    
    Write-Host "Extracting MediaMTX..."
    Expand-Archive -Path $mtxZip -DestinationPath $MEDIAMTX_DIR -Force
    Remove-Item $mtxZip -Force
    Write-Host "MediaMTX installed." -ForegroundColor Green
}

# Configure MediaMTX (Copy existing mediamtx.yml if present, else create default)
# We need to ensure hlsDirectory is Windows compatible and IP addresses are correct
if (Test-Path "mediamtx.yml") {
    $mtxConfig = Get-Content "mediamtx.yml" -Raw
    
    # 1. Fix Linux Paths
    $mtxConfig = $mtxConfig -replace "/dev/shm/hls", "$BASE_DIR/temp/hls"
    
    # 2. Update Host IP for WebRTC (replacing any existing IP in the brackets)
    $mtxConfig = $mtxConfig -replace "webrtcAdditionalHosts: \[.*\]", "webrtcAdditionalHosts: [$HostIP]"
    
    # 3. Update TURN server IP (optional, but good if hardcoded)
    # Assumes format: url: turn:IP:PORT
    $mtxConfig = $mtxConfig -replace "url: turn:[0-9.]+:", "url: turn:$HostIP:"
    
    Set-Content -Path "$MEDIAMTX_DIR\mediamtx.yml" -Value $mtxConfig
    Write-Host "MediaMTX configuration updated with Host IP ($HostIP) and Windows paths." -ForegroundColor Green
}

# --- 5. Start Script ---
Write-Host "Creating Startup Script..." -ForegroundColor Cyan
$startScriptParams = @"
@echo off
echo Starting Campus Watch Services...

:: Start MediaMTX
start "MediaMTX" /D "$MEDIAMTX_DIR" mediamtx.exe

:: Start Backend
start "CampusWatch Backend" java -jar "$BASE_DIR\bin\$BACKEND_JAR"

:: Start Nginx
cd /d "$NGINX_DIR"
start "Nginx" nginx.exe

echo All services started. 
echo Dashboard accessible at http://localhost
pause
"@
Set-Content -Path "$BASE_DIR\start_app.bat" -Value $startScriptParams

Write-Host "`n--- Installation Complete! ---" -ForegroundColor Green
Write-Host "You can start the application using: $BASE_DIR\start_app.bat"
Write-Host "Press any key to exit..."
$root = [Console]::ReadKey()
