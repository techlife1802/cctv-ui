package com.cctv.api.dto;

import lombok.Data;

@Data
public class CameraStreamDto {
    private String id;
    private String name;
    private String status;
    private String streamUrl;
    private String thumbnail;
    private String location;
    private String nvr;
}
