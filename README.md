# Professional CCTV Monitoring Dashboard

A high-performance, real-time surveillance dashboard designed for extreme reliability. Supported features include WebRTC streaming with instant HLS fallback (for H265/slow connections), audio support, localized NVR grouping, and integrated recording/screenshot capabilities.

## 🚀 Key Features

- **Ultra-Reliable Streaming**: Smart WebRTC to HLS fallback (<4s transition).
- **Audio Support**: Hear your cameras with toggleable audio controls.
- **Smart Pagination**: 6-camera grid with per-NVR auto-rotation.
- **Recording & Screenshots**: Capture critical moments directly from the UI.
- **Low Latency**: Optimized LL-HLS configuration via MediaMTX.
- **Responsive Design**: Works perfectly on Desktop, iPad, and Mobile.

---

## 💻 Local Installation (Windows One-Click)

1.  Download or clone this repository to your local machine.
2.  Right-click `install.bat` and select **Run as Administrator**.
3.  The script will:
    - Install Docker Desktop if you don't have it.
    - **Build and start** all required services locally.
4.  Once finished, open `http://localhost:3000` in your browser.

---

## ☁️ Cloud Hosting (Cloudflare Tunnel)

To access your dashboard securely from anywhere without opening firewall ports, follow these steps:

### 1. Set up Cloudflare Tunnel (Recommended)
1.  Go to the [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).
2.  Navigate to **Networks** > **Tunnels** and click **Create a Tunnel**.
3.  Select **Cloudflared** and give it a name (e.g., `cctv-home`).
4.  Follow the instructions to install the connector on your host machine.
5.  In the **Public Hostname** tab, add two hostnames:
    - `cctv.yourdomain.com` -> `http://localhost:3000` (Frontend)
    - `cctv-api.yourdomain.com` -> `http://localhost:8080` (Backend)

### 2. Update Environment Variables (`docker-compose.yml`)
Update all occurrences of the local IP `192.168.0.172` with your professional domain names:

**In `coturn` service:**
- `--external-ip=192.168.0.172` -> Update to your public IP or `cctv.yourdomain.com`.

**In `backend` service:**
- `MEDIAMTX_STREAM_BASE_URL` -> `http://cctv-streams.yourdomain.com`
- `MEDIAMTX_PUBLIC_HOST` -> `cctv-streams.yourdomain.com`.

**In `frontend` service:**
- `REACT_APP_API_URL` -> `http://cctv-api.yourdomain.com`
- `REACT_APP_MEDIAMTX_URL` -> `http://cctv-streams.yourdomain.com`

---

## 🐋 Docker Hub: Build & Upload (Release)

If you want to pull images from the cloud (installer-style) instead of building locally, you must first push them to Docker Hub:

1.  **Login to Docker Hub**:
    ```bash
    docker login
    ```
2.  **Build and Tag Images**:
    ```bash
    # Build Backend
    docker build -t techlife1802/cctv-backend:latest ./backend
    # Build Frontend
    docker build -t techlife1802/cctv-frontend:latest .
    ```
3.  **Upload (Push) to Docker Hub**:
    ```bash
    docker push techlife1802/cctv-backend:latest
    docker push techlife1802/cctv-frontend:latest
    ```
4.  **Switch to Remote Images**: Update `docker-compose.yml` to use `image: techlife1802/...` instead of `build: ./...`.

---

## 🛠 Tech Stack

- **Frontend**: React, TypeScript, Ant Design, HLS.js.
- **Backend**: Java, Spring Boot, WebFlux.
- **Streaming**: MediaMTX (RTSP to WebRTC/HLS).
- **Infrastructure**: Docker, PostgreSQL, Coturn (TURN server).

## 📄 License
MIT License - Personal Use Only
