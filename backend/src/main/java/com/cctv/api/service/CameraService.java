package com.cctv.api.service;

import com.cctv.api.model.Camera;
import com.cctv.api.repository.CameraRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class CameraService {

    private final CameraRepository cameraRepository;

    public List<Camera> getAllCameras() {
        log.debug("Fetching all cameras from DB");
        return cameraRepository.findAll();
    }

    // Helper to init mock cameras if DB is empty (optional logic)
    public void saveAll(List<Camera> cameras) {
        cameraRepository.saveAll(cameras);
    }
}
