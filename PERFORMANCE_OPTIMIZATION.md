# CCTV Streaming System - Performance Optimization Guide

## Executive Summary

This document outlines performance optimizations for a multi-camera CCTV streaming system supporting Hikvision and CPPLUS cameras with multiple concurrent users.

## Current Architecture Analysis

### Strengths
- ✅ HLS streaming for browser compatibility
- ✅ Stream copy mode (low CPU when supported)
- ✅ Idle session cleanup (60s timeout)
- ✅ Staggered frontend initialization (200ms delay)
- ✅ Docker containerization

### Critical Performance Bottlenecks

1. **FFmpeg Process Management**
   - One process per stream = high CPU/memory usage
   - No resource limits or throttling
   - No GPU acceleration
   - Transcoding fallback is CPU-intensive

2. **No Caching Layer**
   - Database queries executed on every request
   - NVR metadata fetched repeatedly
   - No session/stream state caching

3. **Frontend Loading Strategy**
   - All cameras load simultaneously
   - No viewport-based lazy loading
   - No virtual scrolling for large camera grids

4. **Network & I/O**
   - HLS segments served from filesystem (I/O bottleneck)
   - No CDN or edge caching
   - Fixed segment size (2s) - no adaptive bitrate

5. **Scalability Limitations**
   - Single backend instance
   - No horizontal scaling
   - No load balancing

---

## Optimization Recommendations

### Priority 1: Critical (Immediate Impact)

#### 1.1 Add Caching Layer (Redis/Caffeine)
**Impact**: 70-90% reduction in database queries
- Cache NVR metadata (5-10 min TTL)
- Cache stream list responses (30s-1min TTL)
- Cache user authentication tokens

#### 1.2 Optimize FFmpeg Parameters
**Impact**: 30-50% CPU reduction per stream
- Use hardware acceleration (GPU/NVENC)
- Optimize segment size based on network
- Add process priority management
- Implement resource limits per stream

#### 1.3 Frontend Lazy Loading
**Impact**: 60-80% reduction in initial load time
- Viewport-based loading (only visible cameras)
- Virtual scrolling for large grids
- Progressive loading with intersection observer

#### 1.4 Connection Pooling & Resource Limits
**Impact**: Better resource utilization
- Database connection pooling (HikariCP)
- FFmpeg process limits per server
- Memory limits per stream

### Priority 2: High (Significant Impact)

#### 2.1 Nginx Optimization
**Impact**: 40-60% faster HLS segment delivery
- Enable gzip compression
- Add caching headers for segments
- Optimize sendfile/buffering
- Add rate limiting

#### 2.2 Database Query Optimization
**Impact**: 50-70% faster API responses
- Add database indexes
- Use @Query with projections
- Batch operations where possible
- Connection pool tuning

#### 2.3 Stream State Management
**Impact**: Better resource utilization
- Track active viewers per stream
- Share streams between viewers
- Intelligent stream lifecycle management

### Priority 3: Medium (Long-term Benefits)

#### 3.1 Horizontal Scaling
**Impact**: Unlimited scalability
- Load balancer (Nginx/HAProxy)
- Session affinity for streams
- Shared Redis for state
- Multiple backend instances

#### 3.2 CDN Integration
**Impact**: Global low-latency delivery
- CloudFlare/AWS CloudFront
- Edge caching for HLS segments
- Geographic distribution

#### 3.3 Monitoring & Metrics
**Impact**: Proactive performance management
- Prometheus metrics
- Grafana dashboards
- Alerting on resource thresholds
- Stream health monitoring

#### 3.4 Adaptive Bitrate Streaming
**Impact**: Better quality/bandwidth balance
- Multiple quality levels
- Client-side quality selection
- Network-aware streaming

---

## Implementation Priority

### Phase 1 (Week 1): Quick Wins
1. ✅ Add Caffeine cache for NVR queries
2. ✅ Optimize FFmpeg parameters
3. ✅ Frontend viewport-based loading
4. ✅ Database connection pooling
5. ✅ Nginx caching optimization

### Phase 2 (Week 2-3): Infrastructure
1. Add Redis for distributed caching
2. Implement resource limits
3. Add monitoring/metrics
4. Database indexing
5. Stream state management

### Phase 3 (Month 2+): Scale
1. Horizontal scaling setup
2. CDN integration
3. Adaptive bitrate
4. Advanced monitoring

---

## Expected Performance Improvements

| Metric | Current | After Phase 1 | After Phase 2 | After Phase 3 |
|--------|---------|---------------|---------------|---------------|
| API Response Time | 200-500ms | 50-100ms | 20-50ms | 10-30ms |
| Stream Startup Time | 3-8s | 2-4s | 1-3s | <1s |
| CPU per Stream | 15-30% | 8-15% | 5-10% | 3-8% |
| Memory per Stream | 50-100MB | 30-60MB | 20-40MB | 15-30MB |
| Concurrent Streams | 10-20 | 30-50 | 50-100 | 100+ |
| Frontend Load Time | 5-10s | 2-4s | 1-2s | <1s |

---

## Resource Requirements

### Minimum (Phase 1)
- CPU: 4 cores
- RAM: 8GB
- Storage: 50GB SSD
- Network: 100Mbps

### Recommended (Phase 2)
- CPU: 8 cores
- RAM: 16GB
- Storage: 100GB SSD
- Network: 1Gbps
- Redis: 2GB

### Production (Phase 3)
- CPU: 16+ cores (or multiple instances)
- RAM: 32GB+
- Storage: 500GB+ SSD
- Network: 10Gbps
- CDN: CloudFlare/AWS
- Load Balancer: Nginx/HAProxy

---

## Monitoring KPIs

1. **Stream Health**
   - Active streams count
   - Stream startup success rate
   - Stream stability (uptime %)

2. **Resource Usage**
   - CPU utilization per stream
   - Memory usage per stream
   - Disk I/O for HLS segments
   - Network bandwidth

3. **User Experience**
   - API response times (p50, p95, p99)
   - Stream startup latency
   - Playback buffer health
   - Error rates

4. **System Health**
   - Database connection pool usage
   - Cache hit rates
   - FFmpeg process health
   - Nginx request rates

---

## Next Steps

1. Review and prioritize optimizations
2. Implement Phase 1 optimizations
3. Measure baseline performance
4. Deploy and monitor
5. Iterate based on metrics

