# CCTV Application -- Docker Deployment Guide (Mac)

This guide explains how to **build Docker images on a Mac**, **push them
to Docker Hub**, and **pull & run them on a client machine**, along with
**Cloudflare Tunnel (cloudflared)** setup.

------------------------------------------------------------------------

## 1. Prerequisites (Mac -- Build & Client)

Install the following:

-   Docker Desktop for Mac
-   Docker Hub account
-   Cloudflare account (paid/free)
-   Domain configured in Cloudflare DNS

Verify:

``` bash
docker --version
docker compose version
cloudflared --version

to check images ---- 
docker images | grep cctv

to Build Image for UI -----
docker build -t ghcr.io/techlife1802/cctv-frontend:latest .

to Build Image for Backend -----
docker build -t ghcr.io/techlife1802/cctv-backend:latest backend/

echo <CLIENT_GITHUB_TOKEN> | docker login ghcr.io -u techlife1802 --password-stdin


-----to upload the Docker images to github container registry
docker tag cctv-frontend:latest ghcr.io/techlife1802/cctv-frontend:latest
docker tag cctv-backend:latest ghcr.io/techlife1802/cctv-backend:latest
docker push ghcr.io/techlife1802/cctv-frontend:latest
docker push ghcr.io/techlife1802/cctv-backend:latest

On Client machine : ----- 

echo <CLIENT_GITHUB_TOKEN> | docker login ghcr.io -u techlife1802 --password-stdin
docker pull ghcr.io/techlife1802/cctv-frontend:latest
docker pull ghcr.io/techlife1802/cctv-backend:latest


## 3. Update docker-compose.yml (Client Side)

downlaod the docker-compose.yml file from the github repository and update the below lines and keep that 
file in the directory where you have to run the app. 

Also create a nginx folder and add the nginx conf file in same folder

Also create a mediamtx.yml file in the same folder

Replace build sections with images:

``` yaml
backend:
  image: <dockerhub-username>/cctv-backend:latest

frontend:
  image: <dockerhub-username>/cctv-frontend:latest
```

Also add these changes in docker-compose.yml to run on Intel Mac 
 platform: linux/arm64
    image: ghcr.io/techlife1802/cctv-backend:latest

Remove:

``` yaml
build:
```

------------------------------------------------------------------------

## 4. Client Machine -- Pull & Run Containers (Mac)

### 4.1 Login to Docker Hub

``` bash
docker login
```

------------------------------------------------------------------------

### 4.2 Pull Images

``` bash
docker pull <dockerhub-username>/cctv-backend:latest
docker pull <dockerhub-username>/cctv-frontend:latest
```

------------------------------------------------------------------------

### 4.3 Start Application

``` bash
docker compose up -d
```

Check status:

``` bash
docker compose ps
docker logs -f cctv-backend
```

------------------------------------------------------------------------

### 4.4 Conenct to db and verify all tables are created
``` bash
docker exec -it cctv-db psql -U postgres -d cctvdb

to view all tables 
\dt
             List of relations
 Schema |      Name      | Type  |  Owner   
--------+----------------+-------+----------
 public | cameras        | table | postgres
 public | nvrs           | table | postgres
 public | user_audit     | table | postgres
 public | user_locations | table | postgres
 public | users          | table | postgres

to check all tables 

select * from users;

``` 

------------------------------------------------------------------------

## 5. Cloudflare Tunnel (cloudflared)

### 5.1 Install cloudflared (Mac)

``` bash
brew install cloudflare/cloudflare/cloudflared
```

------------------------------------------------------------------------

### 5.2 Login to Cloudflare

``` bash
cloudflared login
```

Authorize domain in browser.

------------------------------------------------------------------------

### 5.3 Create Tunnel

``` bash
cloudflared tunnel create cctv-tunnel
```

------------------------------------------------------------------------

### 5.4 Configure Tunnel

Create config file:

``` bash
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

Example:

``` yaml
tunnel: cctv-tunnel
credentials-file: /Users/<user>/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: app.campuswatch.in
    service: http://localhost:3000

  - hostname: api.campuswatch.in
    service: http://localhost:8080
  
  - hostname: stream.campuswatch.in
    service: http://localhost:8000

  - service: http_status:404
```

------------------------------------------------------------------------

### 5.5 DNS Mapping, This is only required to be done one time

If creating a new tunnel then just update the tunnel id in the DNS for the below given routes by logging in to the clouflared webpage.

``` bash
cloudflared tunnel route dns campus-watch app.campuswatch.in
cloudflared tunnel route dns campus-watch api.campuswatch.in
cloudflared tunnel route dns campus-watch stream.campuswatch.in
cloudflared tunnel route dns campus-watch webrtc.campuswatch.in --- this should be DNL only
```

------------------------------------------------------------------------

### 5.6 Run Tunnel

``` bash
cloudflared tunnel run campus-watch
```

To run in background:

``` bash
cloudflared service install
```
###### 5.7 Add Scripts to run on Startup in MAC

mkdir -p ~/scripts

nano ~/scripts/start-campus-watch.sh

Paste exactly this:
``` bash

#!/bin/bash

# Ensure PATH for launchd
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# --- 1. Wait for Docker Desktop to be ready ---
echo "Waiting for Docker Desktop..."
until docker info >/dev/null 2>&1; do
  sleep 10
done
echo "Docker is ready ✅"

# --- 2. Go to docker-compose directory ---
cd /Users/apple/campus-watch || exit 1

# --- 3. Start Docker Compose services ---
docker compose up -d
echo "Docker Compose services started ✅"

# --- 4. Wait for CCTV Backend to be fully up ---
CONTAINER_NAME="cctv-backend"
SUCCESS_STRING="Application is up and running"  # <-- Replace with your actual log message

echo "Waiting for $CONTAINER_NAME to be ready..."
docker logs -f --tail 50 $CONTAINER_NAME 2>&1 | while read -r line; do
    echo "$line"  # Optional: prints log output to terminal
    if [[ "$line" == *"$SUCCESS_STRING"* ]]; then
        # Notify user
        osascript -e 'Campus watch App is up and runnig on server'
        pkill -P $$ docker  # Stop following logs
        break
    fi
done

# --- 5. Start Cloudflare Tunnel ---
cloudflared tunnel run --protocol http2 campus-watch
echo "Cloudflare Tunnel started ✅"
```
###Make Script executable 
``` bash
chmod +x ~/scripts/start-campus-watch.sh

mkdir -p ~/Library/LaunchAgents

nano ~/Library/LaunchAgents/com.apple.campuswatch.startup.plist
```

###Paste this exactly : 

<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>

    <key>Label</key>
    <string>com.apple.campuswatch.startup</string>

    <key>ProgramArguments</key>
    <array>
      <string>/Users/apple/scripts/start-campus-watch.sh</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/tmp/campuswatch.out.log</string>

    <key>StandardErrorPath</key>
    <string>/tmp/campuswatch.err.log</string>

  </dict>
</plist>


………
launchctl load ~/Library/LaunchAgents/com.apple.campuswatch.startup.plist

✅ Deployment Ready
