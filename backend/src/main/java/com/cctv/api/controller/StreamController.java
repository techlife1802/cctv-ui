package com.cctv.api.controller;

import com.cctv.api.dto.CameraStreamDto;
import com.cctv.api.dto.StreamInfoDto;
import com.cctv.api.model.User;
import com.cctv.api.model.UserRole;
import com.cctv.api.service.HlsService;
import com.cctv.api.service.MediaMtxService;
import com.cctv.api.service.NvrService;
import com.cctv.api.service.UserAuditService;
import com.cctv.api.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.Principal;
import java.util.List;
import java.util.concurrent.TimeUnit;

@Slf4j
@RestController
@RequestMapping("/api/stream")
@RequiredArgsConstructor
public class StreamController {

    private final NvrService nvrService;
    private final HlsService hlsService;
    private final MediaMtxService mediaMtxService;
    private final UserAuditService userAuditService;
    private final UserRepository userRepository;

    @GetMapping("/list")
    public List<CameraStreamDto> getStreams(
            @RequestParam String location,
            @RequestParam(required = false, defaultValue = "All") String nvrId,
            Principal principal,
            HttpServletRequest request) {
        log.info("Requesting streams for location: {}, NVR ID: {}", location, nvrId);

        if (principal != null) {
            userAuditService.logLocationView(principal.getName(), location, request.getRemoteAddr());
        }

        java.util.Set<String> allowedLocations = null;
        java.util.Set<String> assignedCameraIds = null;
        if (principal != null) {
            User user = userRepository.findByUsername(principal.getName()).orElse(null);
            if (user != null && user.getRole() != UserRole.ADMIN) {
                if (user.getLocations() != null && !user.getLocations().isEmpty()) {
                    allowedLocations = user.getLocations();
                } else {
                    allowedLocations = new java.util.HashSet<>(); // No access
                }

                if (user.getAssignedCameraIds() != null && !user.getAssignedCameraIds().isEmpty()) {
                    assignedCameraIds = user.getAssignedCameraIds();
                }
            }
        }

        List<CameraStreamDto> streams = nvrService.getCameraStreams(location, nvrId, allowedLocations,
                assignedCameraIds);
        log.debug("Found {} streams", streams.size());
        return streams;
    }

    @GetMapping(value = "/{nvrId}/{channelId}/index.m3u8")
    public ResponseEntity<Resource> getPlaylist(
            @PathVariable String nvrId,
            @PathVariable int channelId,
            Principal principal,
            HttpServletRequest request) {

        log.debug("Playlist request for NVR: {}, Channel: {}", nvrId, channelId);

        if (principal != null) {
            userAuditService.logNvrAccess(principal.getName(), nvrId, request.getRemoteAddr());
        }

        hlsService.startStreamIfNotActive(nvrId, channelId);

        Path playlistPath = hlsService.getHlsPlaylistPath(nvrId, channelId);

        // Simple wait logic for first-time generation
        int retries = 0;
        while (!Files.exists(playlistPath) && retries < 40) { // Wait up to 8 seconds approx
            try {
                TimeUnit.MILLISECONDS.sleep(200);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
            retries++;
        }

        if (Files.exists(playlistPath)) {
            try {
                Resource resource = new UrlResource(java.util.Objects.requireNonNull(playlistPath.toUri()));
                return ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType("application/vnd.apple.mpegurl"))
                        .header("Cache-Control", "no-cache, no-store, must-revalidate")
                        .header("Pragma", "no-cache")
                        .header("Expires", "0")
                        .body(resource);
            } catch (MalformedURLException e) {
                log.error("Error serving playlist for {}_{}: {}", nvrId, channelId, e.getMessage());
            }
        }

        log.warn("Playlist not found for {}_{} after retries", nvrId, channelId);
        return ResponseEntity.notFound().build();
    }

    /**
     * Get stream information with all available protocols (MediaMTX)
     * Returns WebRTC, HLS, and RTSP URLs
     */
    @GetMapping(value = "/{nvrId}/{channelId}/info")
    public ResponseEntity<StreamInfoDto> getStreamInfo(
            @PathVariable String nvrId,
            @PathVariable int channelId,
            @RequestParam(required = false, defaultValue = "false") boolean substream,
            Principal principal,
            HttpServletRequest request) {

        log.debug("Stream info request for NVR: {}, Channel: {}, Substream: {}", nvrId, channelId, substream);

        if (principal != null) {
            userAuditService.logNvrAccess(principal.getName(), nvrId, request.getRemoteAddr());
        }

        // Get RTSP URL first
        String rtspUrl = nvrService.generateStreamUrl(
                nvrService.getNvrById(nvrId), channelId, substream);

        // Explicitly configure the path in MediaMTX via API
        String pathName = nvrId + "_" + channelId + (substream ? "_sub" : "");
        try {
            Boolean configured = mediaMtxService.configurePath(pathName, rtspUrl)
                    .block(java.time.Duration.ofSeconds(5));
            if (Boolean.FALSE.equals(configured)) {
                log.warn("Failed to configure MediaMTX path: {}", pathName);
            }
        } catch (Exception e) {
            log.error("Error configuring MediaMTX path: {}. Error: {}", pathName, e.getMessage());
        }

        StreamInfoDto streamInfo = mediaMtxService.getStreamInfo(nvrId, channelId, substream, rtspUrl,
                request.getServerName());

        if (streamInfo != null) {
            return ResponseEntity.ok(streamInfo);
        }

        // Fallback to HLS if MediaMTX is disabled
        log.debug("MediaMTX not available, using HLS fallback");
        String hlsUrl = String.format("/api/stream/%s/%d/index.m3u8", nvrId, channelId);

        return ResponseEntity.ok(new StreamInfoDto(
                null, // No WebRTC
                hlsUrl,
                rtspUrl,
                nvrId + "_" + channelId,
                false,
                null)); // No ICE servers
    }

    @GetMapping(value = "/{nvrId}/{channelId}/{segmentName}.ts")
    public ResponseEntity<Resource> getSegment(
            @PathVariable String nvrId,
            @PathVariable int channelId,
            @PathVariable String segmentName) {

        Path segmentPath = hlsService.getHlsPlaylistPath(nvrId, channelId).getParent()
                .resolve(segmentName + ".ts");

        if (Files.exists(segmentPath)) {
            try {
                Resource resource = new UrlResource(java.util.Objects.requireNonNull(segmentPath.toUri()));
                return ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType("video/mp2t"))
                        .body(resource);
            } catch (MalformedURLException e) {
                log.error("Error serving segment", e);
            }
        }

        return ResponseEntity.notFound().build();
    }
}
