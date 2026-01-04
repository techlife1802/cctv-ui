package com.cctv.api.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "user_audit")
public class UserAudit {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false)
    private String username;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 50)
    private AuditAction action; // LOGIN, VIEW_LOCATION, VIEW_NVR

    private String location; // For VIEW_LOCATION action

    private String nvrId; // For NVR access tracking

    @Column(nullable = false)
    private LocalDateTime timestamp;

    @Column(length = 50)
    private String ipAddress;

    @PrePersist
    protected void onCreate() {
        timestamp = LocalDateTime.now();
    }
}
