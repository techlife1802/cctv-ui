package com.cctv.api.service;

import com.cctv.api.model.NVR;
import com.cctv.api.model.NvrType;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Component
public class RtspUrlBuilder {

    @Value("${rtsp.template.hikvision:rtsp://{username}:{password}@{ip}:{port}/Streaming/Channels/{channel}0{stream}}")
    private String hikvisionTemplate;

    @Value("${rtsp.template.cpplus:rtsp://{username}:{password}@{ip}:{port}/cam/realmonitor?channel={channel}&subtype={stream}}")
    private String cpPlusTemplate;

    @Value("${rtsp.template.adiva:rtsp://{username}:{password}@{ip}:{port}/user={username}_password={password}_channel={channel}_stream={stream}.sdp?real_stream.}")
    private String adivaTemplate;

    @Value("${rtsp.template.securus.nvr:rtsp://{username}:{password}@{ip}:{port}/user={username}_password={password}_channel={channel}_stream={stream}.sdp?real_stream.}")
    private String securusNvrTemplate;

    @Value("${rtsp.template.securus.dvr:rtsp://{ip}:{port}/user={username}&password={password}&channel={channel}&stream={stream}.sdp}")
    private String securusDvrTemplate;

    @Value("${rtsp.template.generic:rtsp://{ip}:{port}/stream{channel}}")
    private String genericTemplate;

    /**
     * Build RTSP Stream URL based on NVR type and configured properties
     */
    public String buildStreamUrl(NVR nvr, int channel, boolean substream) {
        String url = "";
        try {
            String port = (nvr.getPort() != null && !nvr.getPort().isEmpty()) ? nvr.getPort() : "554";
            String username = escapeCredential(nvr.getUsername());
            String password = escapeCredential(nvr.getPassword());

            NvrType type = NvrType.fromString(nvr.getType());
            String template = getTemplateForType(type);

            int streamMode = resolveStreamMode(type, substream);

            url = applyTemplate(template, username, password, nvr.getIp(), port, channel, streamMode);
        } catch (Exception e) {
            log.error("Error building RTSP URL for NVR {}: {}", nvr.getName(), e.getMessage(), e);
        }

        String maskedUrl = url.replaceFirst(":[^@]+@", ":****@")
                .replaceAll("password=[^&_]+", "password=****");
        log.info("Generated {} Stream URL for NVR: {} (Channel {}): {}",
                substream ? "Substream" : "Main", nvr.getName(), channel, maskedUrl);
        return url;
    }

    /**
     * Build vendor RTSP stream URL used for ONVIF probe/discovery
     */
    public String buildVendorStreamUrl(String typeStr, String ip, String port, String user, String pass, int channel) {
        String effectivePort = (port != null && !port.isEmpty()) ? port : "554";
        String encodedUser = encode(user);
        String encodedPass = encode(pass);

        NvrType type = NvrType.fromString(typeStr);
        String template = getTemplateForType(type);
        int streamMode = resolveStreamMode(type, false);

        return applyTemplate(template, encodedUser, encodedPass, ip, effectivePort, channel, streamMode);
    }

    private String getTemplateForType(NvrType type) {
        if (type == null) {
            return genericTemplate;
        }
        switch (type) {
            case HIKVISION:
                return hikvisionTemplate;
            case CP_PLUS:
                return cpPlusTemplate;
            case ADIVA:
                return adivaTemplate;
            case SECURUS_DVR:
                return securusDvrTemplate;
            case SECURUS:
            default:
                return securusNvrTemplate;
        }
    }

    private int resolveStreamMode(NvrType type, boolean substream) {
        if (type == NvrType.HIKVISION) {
            return substream ? 2 : 1; // %d01 vs %d02
        } else if (type == NvrType.CP_PLUS) {
            return substream ? 1 : 0; // subtype=0 (main), subtype=1 (sub)
        } else if (type == NvrType.ADIVA || type == NvrType.SECURUS || type == NvrType.SECURUS_DVR) {
            return substream ? 1 : 0; // stream=0 (main), stream=1 (sub)
        }
        return substream ? 1 : 0;
    }

    private String applyTemplate(String template, String user, String pass, String ip, String port, int channel, int stream) {
        return template
                .replace("{username}", user != null ? user : "")
                .replace("{password}", pass != null ? pass : "")
                .replace("{ip}", ip != null ? ip : "")
                .replace("{port}", port != null ? port : "554")
                .replace("{channel}", String.valueOf(channel))
                .replace("{stream}", String.valueOf(stream));
    }

    private String escapeCredential(String val) {
        if (val == null) return "";
        return val.replace("%", "%25")
                .replace("@", "%40")
                .replace(":", "%3A")
                .replace(" ", "%20")
                .replace("#", "%23")
                .replace("?", "%3F")
                .replace("&", "%26")
                .replace("+", "%2B");
    }

    private String encode(String s) {
        if (s == null) return "";
        try {
            return URLEncoder.encode(s, StandardCharsets.UTF_8.toString());
        } catch (Exception e) {
            return s;
        }
    }
}
