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
    private final MediaMtxService mediaMtxService;

    @Cacheable(value = "nvrs", key = "'all'")
    public List<NVR> getAllNvrs() {
        log.debug("Fetching all NVRs from DB");
        return nvrRepository.findAll();
    }

    @CacheEvict(value = { "nvrs", "nvrsByLocation", "streamLists" }, allEntries = true)
    public NVR createNvr(NVR nvr) {
        log.debug("Saving new NVR: {}", nvr.getName());
        return nvrRepository.save(nvr);
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
        return nvrRepository.save(nvr);
    }

    @CacheEvict(value = { "nvrs", "nvrsByLocation", "streamLists" }, allEntries = true)
    public void deleteNvr(String id) {
        log.debug("Deleting NVR with id: {}", id);
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
            int channels = (nvr.getChannels() == null) ? 32 : nvr.getChannels();
            for (int i = 1; i <= channels; i++) {
                CameraStreamDto camDto = new CameraStreamDto();
                camDto.setId(nvr.getId() + "_" + i);
                camDto.setName("Channel " + i);
                camDto.setStatus("Online");
                camDto.setThumbnail(null);

                // Use MediaMTX if enabled, otherwise fallback to HLS
                String proxyUrl;
                if (mediaMtxService.isEnabled()) {
                    // Use stream info endpoint for MediaMTX
                    proxyUrl = String.format("/api/stream/%s/%d/info", nvr.getId(), i);
                } else {
                    // Fallback to HLS
                    proxyUrl = String.format("/api/stream/%s/%d/%s", nvr.getId(), i, AppConstants.HLS_PLAYLIST_NAME);
                }
                camDto.setStreamUrl(proxyUrl);
                camDto.setLocation(nvr.getLocation());
                camDto.setNvr(nvr.getName());
                cameraDtos.add(camDto);
            }

            nvrDto.setCameras(cameraDtos);
            return nvrDto;
        }).toList();
    }

    public NVR getNvrById(String id) {
        return nvrRepository.findById(java.util.Objects.requireNonNull(id))
                .orElseThrow(() -> new RuntimeException("NVR not found with id: " + id));
    }

    @Cacheable(value = "streamLists", key = "#location + '_' + #nvrId")
    public java.util.List<CameraStreamDto> getCameraStreams(String location, String nvrId) {
        log.debug("Fetching camera streams for location: {} and NVR ID: {}", location, nvrId);
        List<NVR> nvrs;
        if (AppConstants.ALL_LOCATION.equalsIgnoreCase(location)) {
            nvrs = nvrRepository.findAll();
        } else {
            nvrs = nvrRepository.findByLocation(location);
        }

        if (nvrId != null && !nvrId.equalsIgnoreCase(AppConstants.ALL_NVR)) {
            nvrs = nvrs.stream()
                    .filter(n -> n.getId().equalsIgnoreCase(nvrId))
                    .toList();
        }

        return nvrs.stream()
                .flatMap(nvr -> {
                    int channels = (nvr.getChannels() == null) ? 32 : nvr.getChannels();
                    java.util.List<CameraStreamDto> nvrCameras = new java.util.ArrayList<>();
                    for (int i = 1; i <= channels; i++) {
                        CameraStreamDto camDto = new CameraStreamDto();
                        camDto.setId(nvr.getId() + "_" + i);
                        camDto.setName("Channel " + i);
                        camDto.setStatus("Online");
                        camDto.setThumbnail(null);

                        // Use MediaMTX if enabled, otherwise fallback to HLS
                        String proxyUrl;
                        if (mediaMtxService.isEnabled()) {
                            // Use stream info endpoint for MediaMTX
                            proxyUrl = String.format("/api/stream/%s/%d/info", nvr.getId(), i);
                        } else {
                            // Fallback to HLS
                            proxyUrl = String.format("/api/stream/%s/%d/%s", nvr.getId(), i,
                                    AppConstants.HLS_PLAYLIST_NAME);
                        }
                        camDto.setStreamUrl(proxyUrl);
                        camDto.setLocation(nvr.getLocation());
                        camDto.setNvr(nvr.getName());
                        nvrCameras.add(camDto);
                    }
                    return nvrCameras.stream();
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
