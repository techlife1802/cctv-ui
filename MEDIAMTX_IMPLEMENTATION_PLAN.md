# MediaMTX Implementation Plan

## Overview

This document outlines the step-by-step plan to migrate from FFmpeg-based HLS to MediaMTX for better performance and lower latency.

## Architecture

```
┌─────────────┐
│   Camera    │ (RTSP)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  MediaMTX   │ (Stream copy, no transcoding)
└──────┬──────┘
       │
       ├──► WebRTC (for real-time viewing)
       ├──► LL-HLS (for browser compatibility)
       └──► RTSP (for direct access)
       │
       ▼
┌─────────────┐
│   Browser   │
└─────────────┘
```

## Implementation Steps

### Step 1: Add MediaMTX Service

#### 1.1 Update docker-compose.yml

```yaml
services:
  mediamtx:
    image: bluenviron/mediamtx:latest
    container_name: cctv-mediamtx
    ports:
      - "8554:8554"  # RTSP
      - "1935:1935"  # RTMP
      - "8888:8888"  # HTTP (API, WebRTC, HLS)
      - "8889:8889"  # HTTPS
    volumes:
      - ./mediamtx.yml:/mediamtx.yml
    environment:
      MTX_PATH: /mediamtx.yml
    restart: unless-stopped
    networks:
      - cctv-network
```

#### 1.2 Create MediaMTX Configuration

Create `mediamtx.yml`:

```yaml
# MediaMTX Configuration for CCTV Streaming

# API
api: yes
apiAddress: :8557

# Authentication (optional, can integrate with your auth)
paths:
  all:
    # Source authentication (cameras)
    sourceOnDemand: yes
    sourceOnDemandStartTimeout: 10s
    sourceOnDemandCloseAfter: 10s
    
    # RTSP settings
    rtspAddress: :8554
    
    # HLS settings (Low Latency)
    hls: yes
    hlsAddress: :8888
    hlsSegmentDuration: 1s      # Lower than current 2s
    hlsPartDuration: 200ms      # For LL-HLS
    hlsSegmentCount: 3          # Keep only 3 segments
    hlsAllowOrigin: "*"
    
    # WebRTC settings
    webrtc: yes
    webrtcAddress: :8888
    webrtcAllowOrigin: "*"
    webrtcEncryption: no        # Use HTTPS in production
    
    # Performance
    readBufferCount: 512
    udpMaxPayloadSize: 1472
```

### Step 2: Update Backend Service

#### 2.1 Add MediaMTX Client Dependency

Add to `pom.xml`:

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-webflux</artifactId>
</dependency>
```

#### 2.2 Create MediaMTX Service

Create `MediaMtxService.java`:

```java
package com.cctv.api.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

@Slf4j
@Service
@RequiredArgsConstructor
public class MediaMtxService {
    
    private final WebClient webClient;
    
    @Value("${mediamtx.api.url:http://mediamtx:8557}")
    private String mediamtxApiUrl;
    
    @Value("${mediamtx.stream.base.url:http://localhost:8888}")
    private String streamBaseUrl;
    
    /**
     * Start a stream in MediaMTX
     */
    public String startStream(String nvrId, int channelId, String rtspUrl) {
        String pathName = getPathName(nvrId, channelId);
        
        // MediaMTX auto-starts streams on demand, but we can pre-configure
        // For on-demand, just return the stream URL
        
        return String.format("%s/%s", streamBaseUrl, pathName);
    }
    
    /**
     * Get WebRTC URL
     */
    public String getWebRtcUrl(String nvrId, int channelId) {
        String pathName = getPathName(nvrId, channelId);
        return String.format("%s/%s/webrtc", streamBaseUrl, pathName);
    }
    
    /**
     * Get LL-HLS URL
     */
    public String getHlsUrl(String nvrId, int channelId) {
        String pathName = getPathName(nvrId, channelId);
        return String.format("%s/%s/index.m3u8", streamBaseUrl, pathName);
    }
    
    /**
     * Configure path in MediaMTX (optional, for pre-configuration)
     */
    public Mono<Void> configurePath(String nvrId, int channelId, String rtspUrl) {
        String pathName = getPathName(nvrId, channelId);
        
        // MediaMTX API call to configure path
        return webClient.post()
                .uri(mediamtxApiUrl + "v3/config/paths/add")
                .bodyValue(Map.of(
                    "name", pathName,
                    "source", rtspUrl,
                    "sourceOnDemand", true
                ))
                .retrieve()
                .bodyToMono(Void.class)
                .doOnSuccess(v -> log.info("Configured MediaMTX path: {}", pathName))
                .doOnError(e -> log.error("Failed to configure path: {}", pathName, e));
    }
    
    private String getPathName(String nvrId, int channelId) {
        return nvrId + "_" + channelId;
    }
}
```

#### 2.3 Update StreamController

Modify `StreamController.java` to use MediaMTX:

```java
@GetMapping(value = "/{nvrId}/{channelId}/stream")
public ResponseEntity<StreamInfo> getStream(
        @PathVariable String nvrId,
        @PathVariable int channelId) {
    
    NVR nvr = nvrService.getNvrById(nvrId);
    String rtspUrl = nvrService.generateStreamUrl(nvr, channelId);
    
    // Get MediaMTX URLs
    String webRtcUrl = mediaMtxService.getWebRtcUrl(nvrId, channelId);
    String hlsUrl = mediaMtxService.getHlsUrl(nvrId, channelId);
    
    return ResponseEntity.ok(new StreamInfo(webRtcUrl, hlsUrl, rtspUrl));
}
```

### Step 3: Update Frontend

#### 3.1 Install WebRTC Library

```bash
npm install @livepeer/react react-player
```

#### 3.2 Create WebRTC Player Component

Create `WebRtcPlayer.tsx`:

```typescript
import React, { useRef, useEffect } from 'react';
import { logger } from '../../utils/logger';

interface WebRtcPlayerProps {
    streamUrl: string;
    autoPlay?: boolean;
    muted?: boolean;
}

const WebRtcPlayer: React.FC<WebRtcPlayerProps> = ({ 
    streamUrl, 
    autoPlay = true, 
    muted = true 
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !streamUrl) return;
        
        // Use native WebRTC if supported
        if (window.RTCPeerConnection) {
            // Simple WebRTC connection
            // For production, use a library like mediasoup or simple-peer
            video.src = streamUrl;
            video.play().catch(err => {
                logger.error('WebRTC play failed', err);
            });
        }
    }, [streamUrl]);
    
    return (
        <video
            ref={videoRef}
            autoPlay={autoPlay}
            muted={muted}
            playsInline
            style={{ width: '100%', height: '100%' }}
        />
    );
};

export default WebRtcPlayer;
```

#### 3.3 Update CameraCard to Support Both

Modify `CameraCard.tsx`:

```typescript
const CameraCard: React.FC<CameraCardProps> = ({ camera, onClick, index = 0 }) => {
    const [useWebRtc, setUseWebRtc] = useState(false);
    const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
    
    useEffect(() => {
        // Fetch stream info (WebRTC + HLS URLs)
        fetchStreamInfo(camera.id).then(info => {
            setStreamInfo(info);
            // Try WebRTC first, fallback to HLS
            setUseWebRtc(isWebRtcSupported());
        });
    }, [camera.id]);
    
    return (
        <div className="camera-card">
            {streamInfo && (
                useWebRtc ? (
                    <WebRtcPlayer streamUrl={streamInfo.webRtcUrl} />
                ) : (
                    <HlsPlayer streamUrl={streamInfo.hlsUrl} />
                )
            )}
        </div>
    );
};
```

### Step 4: Migration Strategy

#### Phase 1: Parallel Deployment (Week 1)
- Deploy MediaMTX alongside current system
- Test with 2-3 cameras
- Compare performance metrics

#### Phase 2: Gradual Migration (Week 2-3)
- Migrate 25% of cameras
- Monitor performance
- Fix any issues

#### Phase 3: Full Migration (Week 4)
- Migrate all cameras
- Remove FFmpeg HLS service
- Update documentation

### Step 5: Performance Monitoring

Add metrics to track:
- Stream latency (WebRTC vs HLS)
- CPU/memory usage
- Concurrent stream capacity
- Error rates

## Benefits After Migration

1. **Latency**: 2-4s → <500ms (WebRTC) or 500ms-2s (LL-HLS)
2. **CPU**: 50-70% reduction per stream
3. **Scalability**: 2-3x more concurrent streams
4. **User Experience**: Near real-time monitoring

## Rollback Plan

If issues occur:
1. Keep MediaMTX running
2. Re-enable FFmpeg HLS service
3. Switch frontend back to HLS URLs
4. Investigate and fix MediaMTX issues

## Testing Checklist

- [ ] MediaMTX service starts correctly
- [ ] Streams start on-demand
- [ ] WebRTC works in modern browsers
- [ ] LL-HLS works as fallback
- [ ] Multiple concurrent streams
- [ ] Stream cleanup on idle
- [ ] Error handling and recovery
- [ ] Performance metrics

## Estimated Timeline

- **Setup**: 1 day
- **Backend Integration**: 2-3 days
- **Frontend Integration**: 2-3 days
- **Testing**: 3-5 days
- **Migration**: 1-2 weeks
- **Total**: 2-3 weeks

## Resources

- MediaMTX Docs: https://mediamtx.org/docs/
- WebRTC Guide: https://webrtc.org/
- LL-HLS Spec: https://developer.apple.com/streaming/

