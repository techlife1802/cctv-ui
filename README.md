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
```

------------------------------------------------------------------------

## 2. Docker Image Build (Mac -- Developer Machine)

### 2.1 Login to Docker Hub

``` bash
docker login
```

------------------------------------------------------------------------

### 2.2 Build Frontend Image

From project root (where Dockerfile exists):

``` bash
docker build -t <dockerhub-username>/cctv-frontend:latest .
```

------------------------------------------------------------------------

### 2.3 Build Backend Image

``` bash
cd backend
docker build -t <dockerhub-username>/cctv-backend:latest .
cd ..
```

------------------------------------------------------------------------

### 2.4 Push Images to Docker Hub

``` bash
docker push <dockerhub-username>/cctv-frontend:latest
docker push <dockerhub-username>/cctv-backend:latest
```

------------------------------------------------------------------------

## 3. Update docker-compose.yml (Client Side)

Replace build sections with images:

``` yaml
backend:
  image: <dockerhub-username>/cctv-backend:latest

frontend:
  image: <dockerhub-username>/cctv-frontend:latest
```

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
  - hostname: api.campuswatch.in
    service: http://localhost:8080
  - hostname: stream.campuswatch.in
    service: http://localhost:8888
  - hostname: webrtc.campuswatch.in
    service: http://localhost:8889
  - service: http_status:404
```

------------------------------------------------------------------------

### 5.5 DNS Mapping, This is only required to be done one time

``` bash
cloudflared tunnel route dns campus-watch api.campuswatch.in
cloudflared tunnel route dns campus-watch stream.campuswatch.in
cloudflared tunnel route dns campus-watch webrtc.campuswatch.in
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

------------------------------------------------------------------------

## 6. Ports Used

  Service    Port
  ---------- ------
  Backend    8080
  Frontend   3000
  RTSP       8554
  HLS        8888
  WebRTC     8889
  TURN       3478
  Postgres   5433

------------------------------------------------------------------------

## 7. Stop & Cleanup

``` bash
docker compose down
docker system prune -f
```

------------------------------------------------------------------------

✅ Deployment Ready
