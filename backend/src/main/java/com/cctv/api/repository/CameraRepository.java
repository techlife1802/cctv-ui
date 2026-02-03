package com.cctv.api.repository;

import com.cctv.api.model.Camera;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CameraRepository extends JpaRepository<Camera, String> {
    List<Camera> findByLocation(String location);

    List<Camera> findByNvrId(String nvrId);

    List<Camera> findByLocationAndNvrId(String location, String nvrId);
}
