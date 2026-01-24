package com.cctv.api.service;

import com.cctv.api.model.NVR;
import com.cctv.api.model.NvrType;
import com.cctv.api.constant.AppConstants;
import com.cctv.api.dto.NvrCameraStreamDto;
import com.cctv.api.dto.CameraStreamDto;
import com.cctv.api.repository.NvrRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class NvrService {

    private final NvrRepository nvrRepository;
    private final com.cctv.api.repository.CameraRepository cameraRepository;
    private final MediaMtxService mediaMtxService;

    @Cacheable(value = "nvrs", key = "'all' + #allowedLocations")
    public List<NVR> getAllNvrs(java.util.Set<String> allowedLocations) {
        log.debug("Fetching all NVRs from DB with allowed locations: {}", allowedLocations);
        List<NVR> allNvrs = nvrRepository.findAll();

        // Null means unrestricted (Admin)
        if (allowedLocations == null) {
            return allNvrs;
        }

        // Empty means no access
        if (allowedLocations.isEmpty()) {
            return new java.util.ArrayList<>();
        }

        return allNvrs.stream()
                .filter(nvr -> allowedLocations.contains(nvr.getLocation()))
                .toList();
    }

    // Legacy method overload for internal usage if needed, acting as admin/all
    public List<NVR> getAllNvrs() {
        return nvrRepository.findAll();
    }

    @CacheEvict(value = { "nvrs", "nvrsByLocation", "streamLists" }, allEntries = true)
    public NVR createNvr(NVR nvr) {
        log.debug("Saving new NVR: {}", nvr.getName());
        NVR savedNvr = nvrRepository.save(nvr);

        if (nvr.getCameras() != null && !nvr.getCameras().isEmpty()) {
            List<com.cctv.api.model.Camera> cameras = nvr.getCameras();
            cameras.forEach(cam -> cam.setNvrId(savedNvr.getId()));
            cameraRepository.saveAll(cameras);
        }

        return savedNvr;
    }

    @CacheEvict(value = { "nvrs", "nvrsByLocation", "streamLists" }, allEntries = true)
    public NVR updateNvr(String id, NVR nvrDetails) {
        log.debug("Updating NVR: {}", id);
        NVR nvr = nvrRepository.findById(java.util.Objects.requireNonNull(id)).orElseThrow(() -> {
            log.error("NVR not found with id: {}", id);
            return new RuntimeException("NVR not found");
        });
        nvr.setName(nvrDetails.getName());
        nvr.setLocation(nvrDetails.getLocation());
        nvr.setIp(nvrDetails.getIp());
        nvr.setPort(nvrDetails.getPort());
        nvr.setUsername(nvrDetails.getUsername());
        nvr.setPassword(nvrDetails.getPassword());
        nvr.setType(nvrDetails.getType());
        nvr.setChannels(nvrDetails.getChannels());
        nvr.setOnvifPort(nvrDetails.getOnvifPort());
        nvr.setOnvifUsername(nvrDetails.getOnvifUsername());
        nvr.setOnvifPassword(nvrDetails.getOnvifPassword());

        NVR savedNvr = nvrRepository.save(nvr);

        if (nvrDetails.getCameras() != null) {
            // Remove existing cameras for this NVR
            List<com.cctv.api.model.Camera> existingCameras = cameraRepository.findByNvrId(id);
            cameraRepository.deleteAll(existingCameras);

            // Save new cameras
            if (!nvrDetails.getCameras().isEmpty()) {
                List<com.cctv.api.model.Camera> cameras = nvrDetails.getCameras();
                cameras.forEach(cam -> cam.setNvrId(savedNvr.getId()));
                cameraRepository.saveAll(cameras);
            }
        }

        return savedNvr;
    }

    @CacheEvict(value = { "nvrs", "nvrsByLocation", "streamLists" }, allEntries = true)
    public void deleteNvr(String id) {
        log.debug("Deleting NVR with id: {}", id);
        List<com.cctv.api.model.Camera> cameras = cameraRepository.findByNvrId(id);
        cameraRepository.deleteAll(cameras);
        nvrRepository.deleteById(java.util.Objects.requireNonNull(id));
    }

    @Cacheable(value = "nvrsByLocation", key = "#location")
    public java.util.List<NvrCameraStreamDto> getNvrCameraStreamsByLocation(String location) {
        log.debug("Fetching NVR streams for location: {}", location);
        List<NVR> nvrs;
        if (AppConstants.ALL_LOCATION.equalsIgnoreCase(location)) {
            nvrs = nvrRepository.findAll();
        } else {
            nvrs = nvrRepository.findByLocation(location);
        }

        return nvrs.stream().map(nvr -> {
            NvrCameraStreamDto nvrDto = new NvrCameraStreamDto();
            nvrDto.setNvrId(nvr.getId());
            nvrDto.setNvrName(nvr.getName());
            nvrDto.setNvrIp(nvr.getIp());
            nvrDto.setNvrType(nvr.getType());

            List<CameraStreamDto> cameraDtos = new java.util.ArrayList<>();
            List<com.cctv.api.model.Camera> cameras = cameraRepository.findByNvrId(nvr.getId());

            if (!cameras.isEmpty()) {
                for (com.cctv.api.model.Camera cam : cameras) {
                    CameraStreamDto camDto = new CameraStreamDto();
                    camDto.setId(cam.getId());
                    camDto.setName(cam.getName());
                    camDto.setStatus(cam.getStatus() != null ? cam.getStatus() : "Online");
                    camDto.setThumbnail(null);

                    // Use available stream info
                    String proxyUrl;
                    // Ideally use streamPath if set, or fall back to channel-based convention
                    String pathName = cam.getStreamPath();
                    if (pathName == null || pathName.isEmpty()) {
                        // usage of channel if streamPath is missing
                        int ch = (cam.getChannel() != null) ? cam.getChannel() : 1;
                        pathName = nvr.getId() + "_" + ch;
                    }

                    if (mediaMtxService.isEnabled()) {
                        proxyUrl = String.format("/api/stream/%s/info", pathName);
                    } else {
                        proxyUrl = String.format("/api/stream/%s/%s", pathName, AppConstants.HLS_PLAYLIST_NAME);
                    }

                    camDto.setStreamUrl(proxyUrl);
                    camDto.setLocation(cam.getLocation() != null ? cam.getLocation() : nvr.getLocation());
                    camDto.setNvr(nvr.getName());
                    cameraDtos.add(camDto);
                }
            } else {
                // Fallback to legacy loop if no cameras persisted
                int channels = (nvr.getChannels() == null) ? 32 : nvr.getChannels();
                for (int i = 1; i <= channels; i++) {
                    CameraStreamDto camDto = new CameraStreamDto();
                    camDto.setId(nvr.getId() + "_" + i);
                    camDto.setName("Channel " + i);
                    camDto.setStatus("Online");
                    camDto.setThumbnail(null);

                    String proxyUrl;
                    if (mediaMtxService.isEnabled()) {
                        proxyUrl = String.format("/api/stream/%s/%d/info", nvr.getId(), i);
                    } else {
                        proxyUrl = String.format("/api/stream/%s/%d/%s", nvr.getId(), i,
                                AppConstants.HLS_PLAYLIST_NAME);
                    }
                    camDto.setStreamUrl(proxyUrl);
                    camDto.setLocation(nvr.getLocation());
                    camDto.setNvr(nvr.getName());
                    cameraDtos.add(camDto);
                }
            }

            nvrDto.setCameras(cameraDtos);
            return nvrDto;
        }).toList();
    }

    public NVR getNvrById(String id) {
        return nvrRepository.findById(java.util.Objects.requireNonNull(id))
                .orElseThrow(() -> new RuntimeException("NVR not found with id: " + id));
    }

    @Cacheable(value = "streamLists", key = "#location + '_' + #nvrId + '_' + #allowedLocations")
    public java.util.List<CameraStreamDto> getCameraStreams(String location, String nvrId,
            java.util.Set<String> allowedLocations) {
        log.debug("Fetching camera streams for location: {}, NVR ID: {}, Allowed: {}", location, nvrId,
                allowedLocations);
        List<NVR> nvrs;
        if (AppConstants.ALL_LOCATION.equalsIgnoreCase(location)) {
            nvrs = nvrRepository.findAll();
        } else {
            nvrs = nvrRepository.findByLocation(location);
        }

        // Filter by allowed locations if restricted
        if (allowedLocations != null && !allowedLocations.isEmpty()) {
            nvrs = nvrs.stream()
                    .filter(nvr -> allowedLocations.contains(nvr.getLocation()))
                    .toList();
        } else {
            // If strictly enforcing empty allowedLocations as "No Access", return empty
            // list.
            // BUT for now, let's assume if this is called with null/empty from a context
            // that implies "Admin" or "No restriction", we pass.
            // Actually, best practice is to pass NULL for unrestricted, and empty set for
            // "No Access".
            // Let Controller decide.
        }

        if (nvrId != null && !nvrId.equalsIgnoreCase(AppConstants.ALL_NVR)) {
            nvrs = nvrs.stream()
                    .filter(n -> n.getId().equalsIgnoreCase(nvrId))
                    .toList();
        }

        return nvrs.stream()
                .flatMap(nvr -> {
                    List<com.cctv.api.model.Camera> cameras = cameraRepository.findByNvrId(nvr.getId());
                    if (!cameras.isEmpty()) {
                        return cameras.stream().map(cam -> {
                            CameraStreamDto camDto = new CameraStreamDto();
                            camDto.setId(cam.getId());
                            camDto.setName(cam.getName());
                            camDto.setStatus(cam.getStatus() != null ? cam.getStatus() : "Online");
                            camDto.setThumbnail(null);

                            String proxyUrl;
                            String pathName = cam.getStreamPath();
                            if (pathName == null || pathName.isEmpty()) {
                                int ch = (cam.getChannel() != null) ? cam.getChannel() : 1;
                                pathName = nvr.getId() + "_" + ch;
                            }

                            if (mediaMtxService.isEnabled()) {
                                proxyUrl = String.format("/api/stream/%s/info", pathName);
                            } else {
                                proxyUrl = String.format("/api/stream/%s/%s", pathName, AppConstants.HLS_PLAYLIST_NAME);
                            }
                            camDto.setStreamUrl(proxyUrl);
                            camDto.setLocation(cam.getLocation() != null ? cam.getLocation() : nvr.getLocation());
                            camDto.setNvr(nvr.getName());
                            return camDto;
                        });
                    } else {
                        // Fallback logic
                        int channels = (nvr.getChannels() == null) ? 32 : nvr.getChannels();
                        java.util.List<CameraStreamDto> nvrCameras = new java.util.ArrayList<>();
                        for (int i = 1; i <= channels; i++) {
                            CameraStreamDto camDto = new CameraStreamDto();
                            camDto.setId(nvr.getId() + "_" + i);
                            camDto.setName("Channel " + i);
                            camDto.setStatus("Online");
                            camDto.setThumbnail(null);

                            String proxyUrl;
                            if (mediaMtxService.isEnabled()) {
                                proxyUrl = String.format("/api/stream/%s/%d/info", nvr.getId(), i);
                            } else {
                                proxyUrl = String.format("/api/stream/%s/%d/%s", nvr.getId(), i,
                                        AppConstants.HLS_PLAYLIST_NAME);
                            }
                            camDto.setStreamUrl(proxyUrl);
                            camDto.setLocation(nvr.getLocation());
                            camDto.setNvr(nvr.getName());
                            nvrCameras.add(camDto);
                        }
                        return nvrCameras.stream();
                    }
                })
                .toList();
    }

    public String generateStreamUrl(NVR nvr, int channel) {
        String url = "";
        String port = (nvr.getPort() != null && !nvr.getPort().isEmpty()) ? nvr.getPort()
                : AppConstants.DEFAULT_RTSP_PORT;

        try {
            // Manual minimal encoding for RTSP credentials to avoid URLEncoder "+" issues
            // We only really need to encode '@' and ':' if they appear in credentials
            String username = nvr.getUsername().replace("@", "%40").replace(":", "%3A").replace(" ", "%20");
            String password = nvr.getPassword().replace("@", "%40").replace(":", "%3A").replace(" ", "%20");

            NvrType type = NvrType.fromString(nvr.getType());
            if (type != null) {
                if (type == NvrType.HIKVISION) {
                    url = String.format("rtsp://%s:%s@%s:%s/Streaming/Channels/%d01",
                            username, password, nvr.getIp(), port, channel);
                } else if (type == NvrType.CP_PLUS) {
                    url = String.format("rtsp://%s:%s@%s:%s/cam/realmonitor?channel=%d&subtype=0",
                            username, password, nvr.getIp(), port, channel);
                }
            }
        } catch (Exception e) {
            log.error("Error generating RTSP URL", e);
        }
        log.info("url is :::{}", url);
        String maskedUrl = url.replaceFirst(":[^@]+@", ":****@");
        log.info("Generated Stream URL for NVR: {} (Channel {}): {}", nvr.getName(), channel, maskedUrl);
        return url;
    }
}
