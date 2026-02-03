#!/bin/bash
echo "1. Checking Docker Containers..."
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep cctv

echo -e "\n2. Testing Local Nginx (Port 8000)..."
curl -v --max-time 5 http://localhost:8000/ || echo "Failed to reach Nginx on 8000"

echo -e "\n3. Testing MediaMTX API via Nginx..."
# This assumes there is no path yet, should return 404 or MediaMTX page
curl -v --max-time 5 http://localhost:8000/v3/config/paths/list || echo "Failed to proxy to MediaMTX"

echo -e "\n4. Checking if Port 8000 is listening..."
lsof -i :8000 || echo "Nothing listening on port 8000"
