package com.cctv.api.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.ToString;

@Data
@Entity
@Table(name = "nvrs")
@ToString
public class NVR {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    private String name;
    private String location;
    private String ip;
    private String port;
    private String username;
    private String password;
    private String status;
    private String type; // Hikvision or CP Plus
    private Integer channels = 32;
}
