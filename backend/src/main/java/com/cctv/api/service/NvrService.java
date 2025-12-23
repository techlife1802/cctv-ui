package com.cctv.api.service;

import com.cctv.api.model.NVR;
import com.cctv.api.dto.NvrCameraStreamDto;
import com.cctv.api.dto.CameraStreamDto;
import com.cctv.api.repository.NvrRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class NvrService {

    private final NvrRepository nvrRepository;

    public List<NVR> getAllNvrs() {
        log.debug("Fetching all NVRs from DB");
        return nvrRepository.findAll();
    }

    public NVR createNvr(NVR nvr) {
        log.debug("Saving new NVR: {}", nvr.getName());
        return nvrRepository.save(nvr);
    }

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
        nvr.setStatus(nvrDetails.getStatus());
        nvr.setType(nvrDetails.getType());
        nvr.setChannels(nvrDetails.getChannels());
        return nvrRepository.save(nvr);
    }

    public void deleteNvr(String id) {
        log.debug("Deleting NVR with id: {}", id);
        nvrRepository.deleteById(id);
    }

    public java.util.List<NvrCameraStreamDto> getNvrCameraStreamsByLocation(String location) {
        log.debug("Fetching NVR streams for location: {}", location);
        List<NVR> nvrs = nvrRepository.findByLocation(location);

        return nvrs.stream().map(nvr -> {
            NvrCameraStreamDto nvrDto = new NvrCameraStreamDto();
            nvrDto.setNvrId(nvr.getId());
            nvrDto.setNvrName(nvr.getName());
            nvrDto.setNvrIp(nvr.getIp());
            nvrDto.setNvrStatus(nvr.getStatus());
            nvrDto.setNvrType(nvr.getType());

            List<CameraStreamDto> cameraDtos = new java.util.ArrayList<>();
            int channels = (nvr.getChannels() == null) ? 32 : nvr.getChannels();
            for (int i = 1; i <= channels; i++) {
                CameraStreamDto camDto = new CameraStreamDto();
                camDto.setId(nvr.getId() + "_" + i);
                camDto.setName("Channel " + i);
                camDto.setStatus("Online");
                camDto.setThumbnail(null);

                String proxyUrl = String.format("/api/stream/%s/%d/index.m3u8", nvr.getId(), i);
                camDto.setStreamUrl(proxyUrl);
                cameraDtos.add(camDto);
            }

            nvrDto.setCameras(cameraDtos);
            return nvrDto;
        }).toList();
    }

    public NVR getNvrById(String id) {
        return nvrRepository.findById(id).orElseThrow(() -> new RuntimeException("NVR not found with id: " + id));
    }

    public java.util.List<CameraStreamDto> getCameraStreams(String location, String nvrId) {
        log.debug("Fetching camera streams for location: {} and NVR ID: {}", location, nvrId);
        List<NVR> nvrs;
        if ("All".equalsIgnoreCase(location)) {
            nvrs = nvrRepository.findAll();
        } else {
            nvrs = nvrRepository.findByLocation(location);
        }

        if (nvrId != null && !nvrId.equalsIgnoreCase("All")) {
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

                        String proxyUrl = String.format("/api/stream/%s/%d/index.m3u8", nvr.getId(), i);
                        camDto.setStreamUrl(proxyUrl);
                        nvrCameras.add(camDto);
                    }
                    return nvrCameras.stream();
                })
                .toList();
    }

    public String generateStreamUrl(NVR nvr, int channel) {
        String url = "";
        String port = (nvr.getPort() != null && !nvr.getPort().isEmpty()) ? nvr.getPort() : "554";

        try {

            if (nvr.getType() != null) {
                String type = nvr.getType().toLowerCase();
                if (type.contains("hikvision")) {
                    // RTSP format for Hikvision:
                    // rtsp://user:password@ip:port/Streaming/Channels/101
                    url = String.format("rtsp://%s:%s@%s:%s/Streaming/Channels/%d01",
                            nvr.getUsername(), nvr.getPassword(), nvr.getIp(), port, channel);
                } else if (type.contains("cp plus") || type.contains("cpplus")) {
                    // RTSP format for CP Plus:
                    // rtsp://user:password@ip:port/cam/realmonitor?channel=1&subtype=0
                    url = String.format("rtsp://%s:%s@%s:%s/cam/realmonitor?channel=%d&subtype=0",
                            nvr.getUsername(), nvr.getPassword(), nvr.getIp(), port, channel);
                }
            }
        } catch (Exception e) {
            log.error("Error encoding credentials for RTSP URL", e);
        }

        log.info("Generated Stream URL for NVR: {} (Channel {}): {}", nvr.getName(), channel, url);
        return url;
    }
}
