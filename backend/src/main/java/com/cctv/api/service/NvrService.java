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
    private final OnvifService onvifService;
    private final RtspUrlBuilder rtspUrlBuilder;

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
        onvifService.testAndDiscover(nvr);
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
        onvifService.testAndDiscover(nvrDetails);
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
                    int ch = (cam.getChannel() != null) ? cam.getChannel() : 1;

                    if (mediaMtxService.isEnabled()) {
                        proxyUrl = String.format("/api/stream/%s/%d/info", nvr.getId(), ch);
                    } else {
                        proxyUrl = String.format("/api/stream/%s/%d/%s", nvr.getId(), ch,
                                AppConstants.HLS_PLAYLIST_NAME);
                    }

                    camDto.setStreamUrl(proxyUrl);
                    camDto.setLocation(cam.getLocation() != null ? cam.getLocation() : nvr.getLocation());
                    camDto.setNvr(nvr.getName());
                    camDto.setNvrId(nvr.getId());
                    camDto.setChannelId(ch);
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
                    camDto.setNvrId(nvr.getId());
                    camDto.setChannelId(i);
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

    @Cacheable(value = "streamLists", key = "#location + '_' + #nvrId + '_' + #allowedLocations + '_' + #assignedCameraIds")
    public java.util.List<CameraStreamDto> getCameraStreams(String location, String nvrId,
            java.util.Set<String> allowedLocations, java.util.Set<String> assignedCameraIds) {
        log.debug("Fetching camera streams for location: {}, NVR ID: {}, Allowed: {}, AssignedCameras: {}", location,
                nvrId,
                allowedLocations, assignedCameraIds);
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
                        return cameras.stream()
                                .filter(cam -> {
                                    if (assignedCameraIds != null && !assignedCameraIds.isEmpty()) {
                                        return assignedCameraIds.contains(cam.getId());
                                    }
                                    return true;
                                })
                                .map(cam -> {
                                    CameraStreamDto camDto = new CameraStreamDto();
                                    camDto.setId(cam.getId());
                                    camDto.setName(cam.getName());
                                    camDto.setStatus(cam.getStatus() != null ? cam.getStatus() : "Online");
                                    camDto.setThumbnail(null);

                                    String proxyUrl;
                                    int ch = (cam.getChannel() != null) ? cam.getChannel() : 1;

                                    if (mediaMtxService.isEnabled()) {
                                        proxyUrl = String.format("/api/stream/%s/%d/info", nvr.getId(), ch);
                                    } else {
                                        proxyUrl = String.format("/api/stream/%s/%d/%s", nvr.getId(), ch,
                                                AppConstants.HLS_PLAYLIST_NAME);
                                    }
                                    camDto.setStreamUrl(proxyUrl);
                                    camDto.setLocation(
                                            cam.getLocation() != null ? cam.getLocation() : nvr.getLocation());
                                    camDto.setNvr(nvr.getName());
                                    camDto.setNvrId(nvr.getId());
                                    camDto.setChannelId(ch);
                                    return camDto;
                                });
                    } else {
                        // Fallback logic
                        int channels = (nvr.getChannels() == null) ? 32 : nvr.getChannels();
                        java.util.List<CameraStreamDto> nvrCameras = new java.util.ArrayList<>();
                        for (int i = 1; i <= channels; i++) {
                            String camId = nvr.getId() + "_" + i;
                            // Check assignment for fallback channels if needed (using generated ID)
                            if (assignedCameraIds != null && !assignedCameraIds.isEmpty()) {
                                if (!assignedCameraIds.contains(camId)) {
                                    continue;
                                }
                            }

                            CameraStreamDto camDto = new CameraStreamDto();
                            camDto.setId(camId);
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
                            camDto.setNvrId(nvr.getId());
                            camDto.setChannelId(i);
                            nvrCameras.add(camDto);
                        }
                        return nvrCameras.stream();
                    }
                })
                .toList();
    }

    public String generateStreamUrl(NVR nvr, int channel, boolean substream) {
        return rtspUrlBuilder.buildStreamUrl(nvr, channel, substream);
    }

    // Overload for backward compatibility
    public String generateStreamUrl(NVR nvr, int channel) {
        return generateStreamUrl(nvr, channel, false);
    }
}
