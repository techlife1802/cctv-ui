package com.cctv.api.controller;

import com.cctv.api.model.Camera;
import com.cctv.api.service.CameraService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/cameras")
@CrossOrigin(origins = "http://localhost:3000")
@RequiredArgsConstructor
public class CameraController {

    private final CameraService cameraService;

    @GetMapping
    public List<Camera> getAllCameras() {
        log.info("Fetching all cameras");
        return cameraService.getAllCameras();
    }
}
