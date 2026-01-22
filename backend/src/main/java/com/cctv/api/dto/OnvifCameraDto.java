package com.cctv.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OnvifCameraDto {
    private String name;
    private int channel;
    private String profileToken;
    private String streamUri;
    private String status; // Online/Offline
}
