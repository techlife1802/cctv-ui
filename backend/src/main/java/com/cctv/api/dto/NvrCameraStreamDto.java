package com.cctv.api.dto;

import lombok.Data;
import java.util.List;

@Data
public class NvrCameraStreamDto {
    private String nvrId;
    private String nvrName;
    private String nvrIp;
    private String nvrType;
    private List<CameraStreamDto> cameras;
}
