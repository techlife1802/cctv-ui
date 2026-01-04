# Quick Start Guide - Optimized CCTV System

## 🚀 Quick Deployment

### 1. Build and Start Services
```bash
docker-compose up -d --build
```

### 2. Verify Services
```bash
# Check backend health
curl http://localhost:8080/actuator/health

# Check stream statistics
curl http://localhost:8080/api/stream/stats
```

### 3. Access Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8080/api
- **Health/Metrics**: http://localhost:8080/actuator

## ⚙️ Configuration

### Key Environment Variables

```bash
# Maximum concurrent streams (default: 50)
HLS_MAX_STREAMS=50

# Idle timeout in seconds (default: 60)
HLS_IDLE_TIMEOUT=60

# CORS origins (default: *)
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
```

### Adjusting Resource Limits

Edit `docker-compose.yml` or set environment variables:

```bash
BACKEND_CPU_LIMIT=4          # CPU cores limit
BACKEND_MEMORY_LIMIT=8G      # Memory limit
DB_CPU_LIMIT=2               # Database CPU limit
DB_MEMORY_LIMIT=2G           # Database memory limit
```

## 📊 Monitoring

### Stream Statistics
```bash
GET /api/stream/stats
```

Response:
```json
{
  "activeStreams": 15,
  "maxStreams": 50,
  "activeStreamIds": ["nvr1_1", "nvr2_3"]
}
```

### Cache Statistics
```bash
GET /actuator/caches
```

### System Metrics
```bash
GET /actuator/metrics
GET /actuator/metrics/jvm.memory.used
GET /actuator/metrics/process.cpu.usage
```

## 🔧 Performance Tuning

### For High Camera Count (50+ cameras)
1. Increase `HLS_MAX_STREAMS` to 100-200
2. Increase backend CPU/memory limits
3. Consider using Redis for distributed caching
4. Enable horizontal scaling

### For Low Latency Requirements
1. Reduce `HLS_IDLE_TIMEOUT` to 30s
2. Adjust HLS segment time (currently 2s)
3. Enable hardware acceleration if available
4. Use CDN for global distribution

### For Limited Resources
1. Reduce `HLS_MAX_STREAMS` to 20-30
2. Increase cache TTLs to reduce DB load
3. Enable lazy loading (already implemented)
4. Use lower quality transcoding settings

## 🐛 Troubleshooting

### Streams Not Starting
```bash
# Check active streams
curl http://localhost:8080/api/stream/stats

# Check logs
docker logs cctv-backend

# Verify FFmpeg is installed
docker exec cctv-backend ffmpeg -version
```

### High CPU Usage
1. Check stream count vs. limit
2. Verify stream copy mode is working
3. Reduce concurrent streams if needed
4. Check for stuck FFmpeg processes

### Memory Issues
1. Monitor cache size: `/actuator/caches`
2. Reduce cache TTLs in `CacheConfig.java`
3. Check for memory leaks in logs

## 📈 Expected Performance

With optimizations enabled:
- **API Response**: 50-100ms (was 200-500ms)
- **Stream Startup**: 2-4s (was 3-8s)
- **CPU per Stream**: 8-15% (was 15-30%)
- **Concurrent Streams**: 30-50 (was 10-20)

## 🔄 Updating Configuration

After changing environment variables:
```bash
docker-compose down
docker-compose up -d
```

For code changes:
```bash
docker-compose up -d --build
```

## 📚 Additional Resources

- `PERFORMANCE_OPTIMIZATION.md` - Detailed analysis
- `OPTIMIZATION_SUMMARY.md` - Implementation details
- Spring Boot Actuator docs for monitoring
- FFmpeg documentation for encoding options

