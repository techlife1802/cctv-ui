package com.cctv.api.controller;

import com.cctv.api.service.HlsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
@RequestMapping("/api/stream/stats")
@RequiredArgsConstructor
public class StreamStatsController {

    private final HlsService hlsService;

    @GetMapping
    public ResponseEntity<HlsService.StreamStats> getStreamStats() {
        return ResponseEntity.ok(hlsService.getStreamStats());
    }
}

