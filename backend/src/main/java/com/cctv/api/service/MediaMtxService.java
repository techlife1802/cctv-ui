package com.cctv.api.service;

import com.cctv.api.dto.StreamInfoDto;
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
    private final java.util.Map<String, String> configCache = new java.util.concurrent.ConcurrentHashMap<>();

    @Value("${mediamtx.api.url:http://mediamtx:8557}")
    private String mediamtxApiUrl;

    @Value("${mediamtx.api.username:}")
    private String apiUsername;

    @Value("${mediamtx.api.password:}")
    private String apiPassword;

    @Value("${mediamtx.stream.base.url:http://localhost:8888}")
    private String streamBaseUrl;

    @Value("${mediamtx.enabled:true}")
    private boolean mediamtxEnabled;

    @Value("${mediamtx.webrtc.port:8889}")
    private String webrtcPort;

    @Value("${mediamtx.hls.port:8888}")
    private String hlsPort;

    @Value("${mediamtx.public.host:}")
    private String publicHost;

    /**
     * Configure a path in MediaMTX using the REST API
     */
    public Mono<Boolean> configurePath(String pathName, String rtspUrl) {
        if (!mediamtxEnabled) {
            return Mono.just(false);
        }

        // Check cache - if already configured with this URL, we still proceed to ensure
        // it exists in MediaMTX
        // because MediaMTX might have restarted and lost its non-persistent config
        // paths.
        if (rtspUrl.equals(configCache.get(pathName))) {
            log.debug("Path {} already in cache, but verifying existence with MediaMTX", pathName);
        }

        log.info("Configuring MediaMTX path: {} with source: {}", pathName, rtspUrl);

        // Path configuration payload
        java.util.Map<String, Object> body = new java.util.HashMap<>();
        body.put("source", rtspUrl != null ? rtspUrl : "");
        body.put("sourceProtocol", "tcp");
        body.put("sourceOnDemand", true);

        String username = apiUsername != null ? apiUsername : "";
        String password = apiPassword != null ? apiPassword : "";

        return webClient.post()
                .uri(mediamtxApiUrl + "/v3/config/paths/add/" + pathName)
                .headers(h -> {
                    if (!username.isEmpty()) {
                        h.setBasicAuth(username, password);
                    }
                })
                .bodyValue(body)
                .retrieve()
                .toBodilessEntity()
                .map(response -> {
                    log.info("Successfully configured path: {}", pathName);
                    configCache.put(pathName, rtspUrl);
                    return true;
                })
                .onErrorResume(org.springframework.web.reactive.function.client.WebClientResponseException.class, e -> {
                    log.error("Failed to add path: {}. Status: {}, Response: {}",
                            pathName, e.getStatusCode(), e.getResponseBodyAsString());
                    log.warn("Path {} might already exist, attempting to patch.", pathName);
                    return patchPath(pathName, rtspUrl);
                })
                .onErrorResume(e -> {
                    log.error("Unexpected error configuring path: {}. Error: {}", pathName, e.getMessage());
                    return Mono.just(false);
                });
    }

    private Mono<Boolean> patchPath(String pathName, String rtspUrl) {
        if (rtspUrl.equals(configCache.get(pathName))) {
            log.debug("Path {} already in cache (patch), continuing verification", pathName);
        }

        java.util.Map<String, Object> body = new java.util.HashMap<>();
        body.put("source", rtspUrl != null ? rtspUrl : "");
        body.put("sourceProtocol", "tcp");
        body.put("sourceOnDemand", true);

        String username = apiUsername != null ? apiUsername : "";
        String password = apiPassword != null ? apiPassword : "";

        return webClient.patch()
                .uri(mediamtxApiUrl + "/v3/config/paths/patch/" + pathName)
                .headers(h -> {
                    if (!username.isEmpty()) {
                        h.setBasicAuth(username, password);
                    }
                })
                .bodyValue(body)
                .retrieve()
                .toBodilessEntity()
                .map(response -> {
                    log.info("Successfully patched path: {}", pathName);
                    configCache.put(pathName, rtspUrl);
                    return true;
                })
                .onErrorResume(org.springframework.web.reactive.function.client.WebClientResponseException.class, e -> {
                    log.error("Failed to patch path: {}. Status: {}, Response: {}",
                            pathName, e.getStatusCode(), e.getResponseBodyAsString());
                    return Mono.just(false);
                })
                .onErrorResume(e -> {
                    log.error("Unexpected error patching path: {}. Error: {}", pathName, e.getMessage());
                    return Mono.just(false);
                });
    }

    /**
     * Get stream information for a pre-configured path
     */
    public StreamInfoDto getStreamInfo(String nvrId, int channelId, String rtspUrl, String hostName) {
        if (!mediamtxEnabled) {
            log.debug("MediaMTX is disabled, returning null stream info");
            return null;
        }

        String streamId = getStreamId(nvrId, channelId);
        String pathName = getPathName(nvrId, channelId);

        String host = "localhost";

        // 1. Priority: Explicit public host configuration (crucial for remote access)
        if (publicHost != null && !publicHost.isEmpty()) {
            host = publicHost;
        }
        // 2. Secondary: Explicit hostname from request if it seems valid
        else if (hostName != null && !hostName.isEmpty()
                && !hostName.equals("db") && !hostName.equals("backend") && !hostName.equals("mediamtx")) {
            host = hostName;
        }
        // 3. Fallback: Inferred from streamBaseUrl
        else if (streamBaseUrl.contains("://")) {
            try {
                java.net.URL url = new java.net.URL(streamBaseUrl);
                String urlHost = url.getHost();
                if (urlHost != null && !urlHost.equalsIgnoreCase("localhost") && !urlHost.equals("127.0.0.1")) {
                    host = urlHost;
                }
            } catch (Exception e) {
                log.warn("Failed to parse streamBaseUrl: {}", streamBaseUrl);
            }
        }

        // Clean URLs (no query parameters as path is now server-side configured)
        String webRtcUrl = String.format("http://%s:%s/%s/whep", host, webrtcPort, pathName);
        String hlsUrl = String.format("http://%s:%s/%s/index.m3u8", host, hlsPort, pathName);

        log.debug("Generated API-driven MediaMTX stream URLs for {}: WebRTC={}, HLS={}",
                streamId, webRtcUrl, hlsUrl);

        // ICE Servers
        java.util.List<StreamInfoDto.IceServer> iceServers = new java.util.ArrayList<>();
        iceServers.add(new StreamInfoDto.IceServer(java.util.List.of("stun:stun.l.google.com:19302"), null, null));

        // Add TURN server using our public host or request host
        String turnHost = host;
        iceServers.add(new StreamInfoDto.IceServer(
                java.util.List.of("turn:" + turnHost + ":3478"),
                "mediamtx",
                "mediamtxpassword"));

        return new StreamInfoDto(webRtcUrl, hlsUrl, rtspUrl, streamId, true, iceServers);
    }

    public Mono<Boolean> deletePath(String pathName) {
        if (!mediamtxEnabled) {
            return Mono.just(false);
        }

        log.info("Deleting MediaMTX path: {}", pathName);

        return webClient.delete()
                .uri(mediamtxApiUrl + "/v3/config/paths/delete/" + pathName)
                .headers(h -> {
                    if (apiUsername != null && !apiUsername.isEmpty()) {
                        h.setBasicAuth(apiUsername, apiPassword != null ? apiPassword : "");
                    }
                })
                .retrieve()
                .toBodilessEntity()
                .map(response -> {
                    configCache.remove(pathName);
                    return true;
                })
                .onErrorResume(e -> {
                    log.error("Failed to delete path: {}. Error: {}", pathName, e.getMessage());
                    return Mono.just(false);
                });
    }

    /**
     * Get path name for MediaMTX
     */
    private String getPathName(String nvrId, int channelId) {
        return getStreamId(nvrId, channelId);
    }

    /**
     * Get stream ID
     */
    private String getStreamId(String nvrId, int channelId) {
        return nvrId + "_" + channelId;
    }

    /**
     * Check if MediaMTX is enabled
     */
    public boolean isEnabled() {
        return mediamtxEnabled;
    }

    /**
     * Get MediaMTX health status
     */
    public Mono<Boolean> checkHealth() {
        if (!mediamtxEnabled) {
            return Mono.just(false);
        }

        String user = apiUsername != null ? apiUsername : "";
        String pass = apiPassword != null ? apiPassword : "";

        WebClient.RequestHeadersSpec<?> requestSpec = webClient.get()
                .uri(mediamtxApiUrl + "/v3/config/get");

        if (!user.isEmpty()) {
            final String fUser = user;
            final String fPass = pass;
            requestSpec.headers(h -> h.setBasicAuth(fUser, fPass));
        }

        return requestSpec
                .retrieve()
                .bodyToMono(String.class)
                .map(response -> true)
                .onErrorReturn(false)
                .timeout(java.time.Duration.ofSeconds(2));
    }
}
