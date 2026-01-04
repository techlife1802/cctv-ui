package com.cctv.api.controller;

import com.cctv.api.dto.NvrCameraStreamDto;
import com.cctv.api.model.NVR;
import com.cctv.api.service.NvrService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/nvrs")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class NvrController {

    private final NvrService nvrService;

    @GetMapping
    public List<NVR> getAllNvrs() {
        log.info("Fetching all NVRs");
        return nvrService.getAllNvrs();
    }

    @GetMapping("/stream")
    public List<NvrCameraStreamDto> getNvrStreamsByLocation(@RequestParam String location) {
        log.info("Fetching NVR streams for location: {}", location);
        return nvrService.getNvrCameraStreamsByLocation(location);
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public NVR createNvr(@RequestBody NVR nvr) {
        log.info("Creating new NVR: {}", nvr.getName());
        return nvrService.createNvr(nvr);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public NVR updateNvr(@PathVariable String id, @RequestBody NVR nvr) {
        log.info("Updating NVR with ID: {}", id);
        return nvrService.updateNvr(id, nvr);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> deleteNvr(@PathVariable String id) {
        log.info("Deleting NVR with ID: {}", id);
        nvrService.deleteNvr(id);
        return ResponseEntity.ok().build();
    }
}
