package com.cctv.api.controller;

import com.cctv.api.dto.CameraStreamDto;
import com.cctv.api.service.HlsService;
import com.cctv.api.service.NvrService;
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
import java.util.List;
import java.util.concurrent.TimeUnit;

@Slf4j
@RestController
@RequestMapping("/api/stream")
@CrossOrigin(origins = "http://localhost:3000")
@RequiredArgsConstructor
public class StreamController {

    private final NvrService nvrService;
    private final HlsService hlsService;

    @GetMapping("/list")
    public List<CameraStreamDto> getStreams(
            @RequestParam String location,
            @RequestParam(required = false, defaultValue = "All") String nvrId) {
        return nvrService.getCameraStreams(location, nvrId);
    }

    @GetMapping(value = "/{nvrId}/{channelId}/index.m3u8")
    public ResponseEntity<Resource> getPlaylist(
            @PathVariable String nvrId,
            @PathVariable int channelId) {

        hlsService.startStreamIfNotActive(nvrId, channelId);

        Path playlistPath = hlsService.getHlsPlaylistPath(nvrId, channelId);

        // Simple wait logic for first-time generation
        int retries = 0;
        while (!Files.exists(playlistPath) && retries < 30) { // Wait up to 6 seconds approx
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
                Resource resource = new UrlResource(playlistPath.toUri());
                return ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType("application/vnd.apple.mpegurl"))
                        .body(resource);
            } catch (MalformedURLException e) {
                log.error("Error serving playlist", e);
            }
        }

        return ResponseEntity.notFound().build();
    }

    @GetMapping(value = "/{nvrId}/{channelId}/{segmentName}.ts")
    public ResponseEntity<Resource> getSegment(
            @PathVariable String nvrId,
            @PathVariable int channelId,
            @PathVariable String segmentName) {

        Path segmentPath = hlsService.getHlsSegmentPath(nvrId, channelId, segmentName + ".ts");

        if (Files.exists(segmentPath)) {
            try {
                Resource resource = new UrlResource(segmentPath.toUri());
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
