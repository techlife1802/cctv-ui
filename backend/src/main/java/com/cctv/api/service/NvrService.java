package com.cctv.api.service;

import com.cctv.api.model.NVR;
import com.cctv.api.repository.NvrRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

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
        NVR nvr = nvrRepository.findById(id).orElseThrow(() -> {
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
        return nvrRepository.save(nvr);
    }

    public void deleteNvr(String id) {
        log.debug("Deleting NVR with id: {}", id);
        nvrRepository.deleteById(id);
    }
}
