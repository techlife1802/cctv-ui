package com.cctv.api.service;

import com.cctv.api.dto.OnvifCameraDto;
import com.cctv.api.model.NVR;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.w3c.dom.Document;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.xpath.XPath;
import javax.xml.xpath.XPathConstants;
import javax.xml.xpath.XPathFactory;
import java.io.ByteArrayInputStream;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import org.apache.http.auth.AuthScope;
import org.apache.http.auth.UsernamePasswordCredentials;
import org.apache.http.client.CredentialsProvider;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.impl.client.BasicCredentialsProvider;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.util.EntityUtils;

@Slf4j
@Service
public class OnvifService {

    private final WebClient webClient;

    public OnvifService(WebClient.Builder builder) {
        this.webClient = builder.build();
    }

    public List<OnvifCameraDto> testAndDiscover(NVR nvr) {

        String ip = nvr.getIp();
        String port = nvr.getOnvifPort() == null ? "80" : nvr.getOnvifPort();
        String user = nvr.getOnvifUsername() != null ? nvr.getOnvifUsername() : nvr.getUsername();
        String pass = nvr.getOnvifPassword() != null ? nvr.getOnvifPassword() : nvr.getPassword();

        // 1️⃣ Try Hikvision ISAPI first
        List<OnvifCameraDto> hikCameras = discoverHikvision(ip, port, user, pass);
        if (!hikCameras.isEmpty()) {
            log.info("Detected Hikvision via ISAPI. Found {} cameras.", hikCameras.size());
            return hikCameras;
        }

        // 2️⃣ Try CP Plus CGI next (with Digest Auth support)
        List<OnvifCameraDto> cpCameras = discoverCpplus(ip, port, user, pass);
        if (!cpCameras.isEmpty()) {
            log.info("Detected CP Plus via CGI. Found {} cameras.", cpCameras.size());
            return cpCameras;
        }

        log.warn("Discovery failed. No supported vendor API found for IP: {}", ip);
        return new ArrayList<>();
    }

    // ========================= VENDOR DISCOVERY =========================

    private List<OnvifCameraDto> discoverCpplus(String ip, String port, String user, String pass) {
        // Correct format: http://ip:port/cgi-bin/... (No user:pass in URL for Digest)
        String url = String.format(
                "http://%s:%s/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle",
                ip, port);

        // Use new Digest-aware client
        String response = sendGetDigest(url, user, pass);
        List<OnvifCameraDto> list = new ArrayList<>();

        if (response != null && !response.isEmpty()) {
            // Parse: table.ChannelTitle[0].Name=Cam1
            try (java.util.Scanner scanner = new java.util.Scanner(response)) {
                java.util.regex.Pattern p = java.util.regex.Pattern
                        .compile("table\\.ChannelTitle\\[(\\d+)\\]\\.Name=(.*)");
                while (scanner.hasNextLine()) {
                    String line = scanner.nextLine().trim();
                    java.util.regex.Matcher m = p.matcher(line);
                    if (m.find()) {
                        try {
                            int idx = Integer.parseInt(m.group(1));
                            String name = m.group(2).trim();
                            int channel = idx + 1;

                            // CP Plus RTSP
                            String rtsp = buildCpplusRtsp(ip, user, pass, channel);

                            // Check for "null" name or empty
                            if (name == null || name.equalsIgnoreCase("null") || name.isEmpty()) {
                                name = "Camera " + channel;
                            }

                            list.add(OnvifCameraDto.builder()
                                    .name(name)
                                    .profileName("Main Stream")
                                    .channel(channel)
                                    .profileToken("Channel_" + channel)
                                    .streamUri(rtsp)
                                    .status("Online")
                                    .build());
                        } catch (Exception e) {
                            // ignore individual parse error
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to parse CP Plus CGI response", e);
            }
        }
        return list;
    }

    private List<OnvifCameraDto> discoverHikvision(String ip, String port, String user, String pass) {
        String url = String.format("http://%s:%s/ISAPI/ContentMgmt/InputProxy/channels", ip, port);
        String response = sendGet(url, user, pass);
        List<OnvifCameraDto> list = new ArrayList<>();

        if (response != null) {
            try {
                Document doc = DocumentBuilderFactory.newInstance()
                        .newDocumentBuilder()
                        .parse(new ByteArrayInputStream(response.getBytes()));
                XPath xp = XPathFactory.newInstance().newXPath();

                NodeList channels = (NodeList) xp.evaluate("//*[local-name()='InputProxyChannel']", doc,
                        XPathConstants.NODESET);
                for (int i = 0; i < channels.getLength(); i++) {
                    String idStr = xp.evaluate(".//*[local-name()='id']", channels.item(i));
                    String name = xp.evaluate(".//*[local-name()='name']", channels.item(i));

                    if (!idStr.isEmpty()) {
                        int channelId = Integer.parseInt(idStr);
                        // Hikvision RTSP: rtsp://user:pass@ip:554/Streaming/Channels/101
                        // Where 101 means Channel 1, Stream 01 (Main)
                        String streamUri = String.format("rtsp://%s:%s@%s:554/Streaming/Channels/%d01",
                                encode(user), encode(pass), ip, channelId);

                        // Fallback name if missing
                        if (name == null || name.isEmpty()) {
                            name = "Camera " + channelId;
                        }

                        list.add(OnvifCameraDto.builder()
                                .name(name)
                                .profileName("Main Stream")
                                .channel(channelId)
                                .profileToken("Channel_" + channelId)
                                .streamUri(streamUri)
                                .status("Online")
                                .build());
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to parse Hikvision ISAPI response", e);
            }
        }
        return list;
    }

    // ========================= UTILS =========================

    private String encode(String value) {
        try {
            return java.net.URLEncoder.encode(value, java.nio.charset.StandardCharsets.UTF_8.toString());
        } catch (Exception e) {
            return value;
        }
    }

    private String buildCpplusRtsp(String ip, String user, String pass, int ch) {
        return String.format(
                "rtsp://%s:%s@%s:554/cam/realmonitor?channel=%d&subtype=0",
                encode(user), encode(pass), ip, ch);
    }

    private String sendGet(String url, String user, String pass) {
        log.info("Sending GET request to URL: {}", url);
        try {
            // Use URI.create(url) to prevent WebClient from double-encoding parameters
            // (e.g. %40 -> %2540)
            java.net.URI uri = java.net.URI.create(url);
            return webClient.get()
                    .uri(uri)
                    .headers(h -> h.setBasicAuth(user, pass))
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(Duration.ofSeconds(5))
                    .block();
        } catch (Exception e) {
            log.warn("GET failed for {}: {}", url, e.getMessage());
            return null;
        }
    }

    /**
     * Sends a GET request using Apache HttpClient with Digest Authentication
     * support.
     * This is required for CP Plus NVRs which use Digest Auth challenge-response.
     */
    private String sendGetDigest(String url, String user, String pass) {
        log.info("Sending Digest GET request to URL: {}", url);

        // 1. Setup the Credentials Provider
        CredentialsProvider provider = new BasicCredentialsProvider();
        provider.setCredentials(
                AuthScope.ANY,
                new UsernamePasswordCredentials(user, pass));

        // 2. Build the client with the provider
        try (CloseableHttpClient client = HttpClients.custom()
                .setDefaultCredentialsProvider(provider)
                .build()) {

            HttpGet request = new HttpGet(url);

            // 3. Execute - The client handles the 401 challenge automatically!
            try (CloseableHttpResponse response = client.execute(request)) {
                int statusCode = response.getStatusLine().getStatusCode();
                String result = EntityUtils.toString(response.getEntity());

                log.info("Digest GET Response Code: {}", statusCode);

                if (statusCode >= 200 && statusCode < 300) {
                    return result;
                } else {
                    log.warn("Digest GET failed with status: {}, Body: {}", statusCode, result);
                    return null;
                }
            }
        } catch (Exception e) {
            log.warn("Digest GET failed for {}: {}", url, e.getMessage());
            // e.printStackTrace(); // Optional: kept log succinct
            return null;
        }
    }
}
