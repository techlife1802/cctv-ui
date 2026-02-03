package com.cctv.api.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class StreamInfoDto {
    private String webRtcUrl;
    private String hlsUrl;
    private String rtspUrl;
    private String streamId;
    private boolean mediamtxEnabled;
    private List<IceServer> iceServers;

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    public static class IceServer {
        private List<String> urls;
        private String username;
        private String credential;
    }
}
