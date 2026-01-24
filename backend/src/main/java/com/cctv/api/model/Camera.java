package com.cctv.api.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.ToString;

@Data
@Entity
@Table(name = "cameras")
@ToString
public class Camera {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    private String name;
    private String streamPath; // The path name configured in mediamtx.yml
    private String location;
    private String nvrId; // Optional grouping by NVR

    private Integer channel;
    private String streamUri;
    private String profileToken;
    private String status;
}
