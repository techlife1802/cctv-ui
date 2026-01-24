package com.cctv.api.controller;

import com.cctv.api.dto.NvrCameraStreamDto;
import com.cctv.api.dto.OnvifCameraDto;
import com.cctv.api.model.NVR;
import com.cctv.api.model.User;
import com.cctv.api.model.UserRole;
import com.cctv.api.service.NvrService;
import com.cctv.api.service.OnvifService;
import com.cctv.api.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import java.security.Principal;
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
    private final OnvifService onvifService;
    private final UserRepository userRepository;

    @PostMapping("/test")
    @PreAuthorize("hasRole('ADMIN')")
    public List<OnvifCameraDto> testNvr(@RequestBody NVR nvr) {
        log.info("Testing NVR connectivity for IP: {}", nvr.getIp());
        return onvifService.testAndDiscover(nvr);
    }

    @GetMapping
    public List<NVR> getAllNvrs(Principal principal) {
        log.info("Fetching all NVRs for user: {}", principal != null ? principal.getName() : "Anonymous");

        java.util.Set<String> allowedLocations = null;
        if (principal != null) {
            User user = userRepository.findByUsername(principal.getName()).orElse(null);
            if (user != null && user.getRole() != UserRole.ADMIN) {
                if (user.getLocations() != null && !user.getLocations().isEmpty()) {
                    allowedLocations = user.getLocations();
                } else {
                    allowedLocations = new java.util.HashSet<>(); // Block access if not admin and no locations?
                    // Or allowedLocations = null means all?
                    // In NvrService logic I wrote: if (allowedLocations == null ||
                    // allowedLocations.isEmpty()) return allNvrs;
                    // This is risky.
                    // Let's refine:
                    // If User has explicit locations, we filter.
                    // If User has NO locations, should they see ALL or NONE?
                    // Requirement: "User Can only access NVRS of those locations." implies if they
                    // have none, they access none.
                    // NvrService logic: empty set -> return empty list? NO.
                    // Let's re-verify NvrService logic.
                    // Wait, in NvrService I wrote: if (allowedLocations == null ||
                    // allowedLocations.isEmpty()) return ALL.
                    // This is WRONG for restrictive access.
                    // I should fix NvrService too.
                    // But for this Controller step, I should pass the set.
                }
            }
        }

        // If we want restriction, we must pass a non-null set if restricting.
        // NvrService.getAllNvrs(Set) logic:
        // if (allowedLocations == null || allowedLocations.isEmpty()) { return all; }
        // -> This means empty set = All access. BAD.

        // I will fix NvrService logic in next step (or previous step was flawed).
        // Let's assume standard behavior:
        // Admin -> allowedLocations = null (meaning all)
        // User -> allowedLocations = user.getLocations() (which might be empty ->
        // meaning none)

        // So I need to ensure NvrService handles empty set as "None", and null as
        // "All".

        return nvrService.getAllNvrs(allowedLocations);
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
