package com.cctv.api.model;

import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
@Table(name = "cameras")
public class Camera {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;
    private String location;

    @Column(name = "nvr_name")
    private String nvr; // Storing NVR name as string to match UI model for now

    private String status;
    private String thumbnail;
}
