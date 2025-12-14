package com.cctv.api.repository;

import com.cctv.api.model.Camera;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CameraRepository extends JpaRepository<Camera, Long> {
}
