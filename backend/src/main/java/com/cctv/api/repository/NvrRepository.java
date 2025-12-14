package com.cctv.api.repository;

import com.cctv.api.model.NVR;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NvrRepository extends JpaRepository<NVR, String> {
}
