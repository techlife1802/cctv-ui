package com.cctv.api.controller;

import com.cctv.api.dto.CameraStreamDto;
import com.cctv.api.dto.PlaybackSegmentDto;
import com.cctv.api.dto.StreamInfoDto;
import com.cctv.api.model.NVR;
import com.cctv.api.model.NvrType;
import com.cctv.api.model.User;
import com.cctv.api.model.UserRole;
import com.cctv.api.service.PlaybackProvider;
import com.cctv.api.service.PlaybackProviderFactory;
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
    private final PlaybackProviderFactory playbackProviderFactory;

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

    /**
     * GET /api/stream/{nvrId}/{channelId}/recordings?start=ISO&end=ISO
     *
     * Returns a list of recording segments from the NVR for the given channel and time range.
     * Currently supports Hikvision NVRs via ISAPI. Returns an empty list for unsupported types.
     */
    @GetMapping(value = "/{nvrId}/{channelId}/recordings")
    public ResponseEntity<java.util.List<PlaybackSegmentDto>> getRecordings(
            @PathVariable String nvrId,
            @PathVariable int channelId,
            @RequestParam String start,
            @RequestParam String end,
            Principal principal) {

        log.info("Recording search: NVR={}, ch={}, start={}, end={}", nvrId, channelId, start, end);

        NVR nvr;
        try {
            nvr = nvrService.getNvrById(nvrId);
        } catch (Exception e) {
            log.error("NVR not found: {}", nvrId);
            return ResponseEntity.notFound().build();
        }

        try {
            PlaybackProvider provider = playbackProviderFactory.getProvider(nvr);
            java.util.List<PlaybackSegmentDto> segments = provider.searchRecordings(nvr, channelId, start, end);
            log.info("Found {} recording segments for channel {}", segments.size(), channelId);
            return ResponseEntity.ok(segments);
        } catch (IllegalArgumentException e) {
            log.info("NVR type '{}' does not support recording search via this API yet", nvr.getType());
            return ResponseEntity.ok(java.util.Collections.emptyList());
        }
    }

    /**
     * GET /api/stream/{nvrId}/{channelId}/recording-url?start=ISO&end=ISO
     *
     * Configures a temporary MediaMTX path for the RTSP playback stream and returns
     * the StreamInfoDto (containing WebRTC/HLS URLs) for the frontend to play.
     */
    @GetMapping(value = "/{nvrId}/{channelId}/recording-url")
    public ResponseEntity<StreamInfoDto> getRecordingUrl(
            @PathVariable String nvrId,
            @PathVariable int channelId,
            @RequestParam String start,
            @RequestParam String end,
            Principal principal,
            HttpServletRequest request) {

        NVR nvr;
        try {
            nvr = nvrService.getNvrById(nvrId);
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }

        try {
            PlaybackProvider provider = playbackProviderFactory.getProvider(nvr);
            String rtspUrl = provider.getPlaybackUrl(nvr, channelId, start, end);
            
            if (rtspUrl != null && !rtspUrl.isEmpty()) {
                // Create a reusable path for this playback session to prevent duplicate RTSP streams
                String pathName = String.format("pb_%s_%d", nvrId, channelId);
                
                try {
                    // Force delete the existing path config first to terminate any active NVR session cleanly
                    try {
                        mediaMtxService.deletePath(pathName).block(java.time.Duration.ofSeconds(2));
                        // Brief sleep to allow the NVR to fully release and free the RTSP stream slot
                        Thread.sleep(800);
                    } catch (Exception ex) {
                        log.debug("No existing path to delete or error deleting path: {}", ex.getMessage());
                    }

                    Boolean configured = mediaMtxService.configurePath(pathName, rtspUrl)
                            .block(java.time.Duration.ofSeconds(5));
                    if (Boolean.FALSE.equals(configured)) {
                        log.warn("Failed to configure MediaMTX path: {}", pathName);
                    }
                } catch (Exception e) {
                    log.error("Error configuring MediaMTX playback path: {}. Error: {}", pathName, e.getMessage());
                }

                StreamInfoDto info = mediaMtxService.getStreamInfoForPath(pathName, pathName, rtspUrl, request.getServerName());
                return ResponseEntity.ok(info);
            }
        } catch (IllegalArgumentException e) {
            log.warn("NVR type not supported for playback: {}", nvr.getType());
        }

        return ResponseEntity.notFound().build();
    }
}
