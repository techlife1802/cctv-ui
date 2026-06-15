package com.cctv.api.service;

import com.cctv.api.dto.PlaybackSegmentDto;
import com.cctv.api.model.NVR;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.xpath.XPath;
import javax.xml.xpath.XPathConstants;
import javax.xml.xpath.XPathFactory;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.text.SimpleDateFormat;
import java.time.Duration;
import java.time.Instant;
import java.util.*;

@Slf4j
@Service
public class OnvifPlaybackProvider implements PlaybackProvider {

    @Override
    public boolean supports(NVR nvr) {
        String type = nvr.getType();
        if (type == null) return false;
        String normalized = type.toLowerCase().replace(" ", "");
        return normalized.contains("hikvision") 
                || normalized.contains("cpplus")
                || normalized.contains("xmeye")
                || normalized.contains("adiva")
                || normalized.contains("securus");
    }

    @Override
    public List<PlaybackSegmentDto> searchRecordings(NVR nvr, int channel, String startTimeIso, String endTimeIso) {
        List<PlaybackSegmentDto> segments = new ArrayList<>();
        String ip = nvr.getIp();
        String port = (nvr.getOnvifPort() != null && !nvr.getOnvifPort().isBlank()) ? nvr.getOnvifPort() : (nvr.getPort() != null ? nvr.getPort() : "80");
        String user = nvr.getOnvifUsername() != null ? nvr.getOnvifUsername() : nvr.getUsername();
        String pass = nvr.getOnvifPassword() != null ? nvr.getOnvifPassword() : nvr.getPassword();

        // Target search service URL. (Ideally queried via GetServices, but standard usually maps here or NVR redirects).
        String searchUrl = String.format("http://%s:%s/onvif/search_service", ip, port);
        
        try {
            // Convert times to strict UTC format required by ONVIF
            Instant startInst = Instant.parse(startTimeIso);
            Instant endInst = Instant.parse(endTimeIso);
            
            // Format: 2026-06-15T00:00:00Z
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'");
            sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
            String startStr = sdf.format(Date.from(startInst));
            String endStr = sdf.format(Date.from(endInst));

            // ONVIF usually maps Channel 1 to TrackToken "track_1" or "101"
            // For universal compatibility, we query without strict track filtering first, or guess the track token.
            // A pure FindRecordings requires a SearchScope. We will send a basic FindRecordings to see what the NVR returns.

            String soapRequest = buildFindRecordingsEnvelope(user, pass, startStr, endStr);
            String response = sendSoapRequest(searchUrl, soapRequest);

            if (response == null || response.contains("Fault")) {
                log.warn("ONVIF FindRecordings returned Fault or Null. NVR may not support Profile G search.");
                // Try alternate endpoint if it failed
                if (response != null && response.contains("ActionNotSupported")) {
                    log.error("ONVIF Profile G Search is NOT supported by this NVR.");
                }
                return getFallbackSegments(nvr, channel, startTimeIso, endTimeIso);
            }

            // Parse SearchToken
            String searchToken = extractXmlTag(response, "SearchToken");
            if (searchToken == null || searchToken.isEmpty()) {
                log.warn("ONVIF FindRecordings succeeded but returned no SearchToken.");
                return getFallbackSegments(nvr, channel, startTimeIso, endTimeIso);
            }

            log.info("ONVIF SearchToken received: {}. Fetching results...", searchToken);

            // Now call GetRecordingSearchResults
            String resultsSoap = buildGetSearchResultsEnvelope(user, pass, searchToken);
            String resultsResponse = sendSoapRequest(searchUrl, resultsSoap);
            
            if (resultsResponse != null) {
                log.info("ONVIF Search Results Raw XML: {}", resultsResponse);
            }

            if (resultsResponse != null && !resultsResponse.contains("Fault")) {
                segments = parseSearchResults(resultsResponse, nvr, channel);
            }

        } catch (Exception e) {
            log.error("ONVIF Search failed for NVR {}: {}", nvr.getIp(), e.getMessage());
        }

        if (segments.isEmpty()) {
            return getFallbackSegments(nvr, channel, startTimeIso, endTimeIso);
        }

        return segments;
    }

    private String buildFindRecordingsEnvelope(String user, String pass, String start, String end) throws Exception {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
                "<s:Envelope xmlns:s=\"http://www.w3.org/2003/05/soap-envelope\" xmlns:tse=\"http://www.onvif.org/ver10/search/wsdl\" xmlns:tt=\"http://www.onvif.org/ver10/schema\">\n" +
                "  <s:Header>\n" +
                buildWsSecurityHeader(user, pass) +
                "  </s:Header>\n" +
                "  <s:Body>\n" +
                "    <tse:FindRecordings>\n" +
                "      <tse:Scope>\n" +
                "        <tt:IncludedSources>\n" +
                "          <tt:Type>http://www.onvif.org/ver10/schema/Profile/Video</tt:Type>\n" +
                "        </tt:IncludedSources>\n" +
                "      </tse:Scope>\n" +
                "      <tse:MaxMatches>100</tse:MaxMatches>\n" +
                "      <tse:KeepAliveTime>PT60S</tse:KeepAliveTime>\n" +
                "    </tse:FindRecordings>\n" +
                "  </s:Body>\n" +
                "</s:Envelope>";
    }

    private String buildGetSearchResultsEnvelope(String user, String pass, String searchToken) throws Exception {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
                "<s:Envelope xmlns:s=\"http://www.w3.org/2003/05/soap-envelope\" xmlns:tse=\"http://www.onvif.org/ver10/search/wsdl\">\n" +
                "  <s:Header>\n" +
                buildWsSecurityHeader(user, pass) +
                "  </s:Header>\n" +
                "  <s:Body>\n" +
                "    <tse:GetRecordingSearchResults>\n" +
                "      <tse:SearchToken>" + searchToken + "</tse:SearchToken>\n" +
                "      <tse:MaxResults>100</tse:MaxResults>\n" +
                "      <tse:WaitTime>PT5S</tse:WaitTime>\n" +
                "    </tse:GetRecordingSearchResults>\n" +
                "  </s:Body>\n" +
                "</s:Envelope>";
    }

    private String buildWsSecurityHeader(String user, String pass) throws Exception {
        SecureRandom random = new SecureRandom();
        byte[] nonceBytes = new byte[16];
        random.nextBytes(nonceBytes);

        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
        String created = sdf.format(new Date());

        MessageDigest md = MessageDigest.getInstance("SHA-1");
        md.update(nonceBytes);
        md.update(created.getBytes(StandardCharsets.UTF_8));
        md.update(pass.getBytes(StandardCharsets.UTF_8));
        byte[] digestBytes = md.digest();

        String nonce64 = Base64.getEncoder().encodeToString(nonceBytes);
        String digest64 = Base64.getEncoder().encodeToString(digestBytes);

        return "<Security s:mustUnderstand=\"1\" xmlns=\"http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd\">\n" +
               "  <UsernameToken>\n" +
               "    <Username>" + user + "</Username>\n" +
               "    <Password Type=\"http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest\">" + digest64 + "</Password>\n" +
               "    <Nonce EncodingType=\"http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary\">" + nonce64 + "</Nonce>\n" +
               "    <Created xmlns=\"http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd\">" + created + "</Created>\n" +
               "  </UsernameToken>\n" +
               "</Security>\n";
    }

    private String sendSoapRequest(String urlStr, String soapXml) {
        try {
            URL url = new URL(urlStr);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/soap+xml; charset=utf-8");
            conn.setDoOutput(true);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(10000);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(soapXml.getBytes(StandardCharsets.UTF_8));
            }

            int responseCode = conn.getResponseCode();
            InputStream is = (responseCode >= 200 && responseCode < 300) ? conn.getInputStream() : conn.getErrorStream();
            
            if (is == null) return null;

            Scanner scanner = new Scanner(is, StandardCharsets.UTF_8.name()).useDelimiter("\\A");
            return scanner.hasNext() ? scanner.next() : "";

        } catch (Exception e) {
            log.error("SOAP POST to {} failed: {}", urlStr, e.getMessage());
            return null;
        }
    }

    private String extractXmlTag(String xml, String tag) {
        String startTag = "<" + tag + ">";
        String endTag = "</" + tag + ">";
        int start = xml.indexOf(startTag);
        if (start == -1) {
            startTag = ":" + tag + ">";
            start = xml.indexOf(startTag);
            if (start == -1) return null;
            // find the start bracket
            start = xml.lastIndexOf("<", start);
            String fullStartTag = xml.substring(start, xml.indexOf(">", start) + 1);
            endTag = "</" + fullStartTag.substring(1, fullStartTag.indexOf(":") + 1) + tag + ">";
            start = xml.indexOf(fullStartTag);
            startTag = fullStartTag;
        }
        int end = xml.indexOf(endTag, start);
        if (end == -1) return null;
        return xml.substring(start + startTag.length(), end);
    }

    private List<PlaybackSegmentDto> parseSearchResults(String xml, NVR nvr, int targetChannel) {
        List<PlaybackSegmentDto> list = new ArrayList<>();
        try {
            Document doc = DocumentBuilderFactory.newInstance()
                    .newDocumentBuilder()
                    .parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
            XPath xp = XPathFactory.newInstance().newXPath();

            NodeList resultInfos = (NodeList) xp.evaluate("//*[local-name()='ResultList']/*[local-name()='RecordingInformation']", doc, XPathConstants.NODESET);

            for (int i = 0; i < resultInfos.getLength(); i++) {
                String recordingToken = xp.evaluate(".//*[local-name()='RecordingToken']", resultInfos.item(i));
                String earliest = xp.evaluate(".//*[local-name()='EarliestRecording']", resultInfos.item(i));
                String latest = xp.evaluate(".//*[local-name()='LatestRecording']", resultInfos.item(i));

                // Heuristic: Hikvision maps RecordingToken001 -> Channel 1, etc.
                int segmentChannel = parseChannelFromToken(recordingToken, i + 1);
                
                if (segmentChannel == targetChannel && !earliest.isEmpty() && !latest.isEmpty()) {
                    Instant start = Instant.parse(earliest);
                    Instant end = Instant.parse(latest);
                    long duration = Duration.between(start, end).getSeconds();

                    if (duration > 0) {
                        java.time.OffsetDateTime startOffset = start.atZone(java.time.ZoneId.systemDefault()).toOffsetDateTime();
                        java.time.OffsetDateTime endOffset = end.atZone(java.time.ZoneId.systemDefault()).toOffsetDateTime();
                        
                        String rtspPlaybackUrl = buildFallbackRtspPlaybackUrl(nvr, targetChannel, startOffset, endOffset);
                        list.add(PlaybackSegmentDto.builder()
                                .startTime(startOffset.toString())
                                .endTime(endOffset.toString())
                                .duration(duration)
                                .url(rtspPlaybackUrl)
                                .recordType("continuous")
                                .build());
                    }
                }
            }
        } catch (Exception e) {
            log.error("Failed to parse ONVIF search results", e);
        }
        return list;
    }

    private int parseChannelFromToken(String token, int fallback) {
        if (token == null) return fallback;
        String digits = token.replaceAll("[^0-9]", "");
        if (digits.isEmpty()) return fallback;
        int parsed = Integer.parseInt(digits);
        // Hikvision track tokens: 101 -> Ch 1, 201 -> Ch 2. XMEYE: track_1 -> Ch 1
        if (parsed > 100 && parsed < 999 && token.length() <= 3) {
            return parsed / 100;
        }
        return parsed;
    }

    private String buildFallbackRtspPlaybackUrl(NVR nvr, int channel, java.time.OffsetDateTime start, java.time.OffsetDateTime end) {
        String ip = nvr.getIp();
        String port = (nvr.getPort() != null && !nvr.getPort().isEmpty()) ? nvr.getPort() : "554";
        
        try {
            String encodedUser = java.net.URLEncoder.encode(nvr.getUsername(), "UTF-8").replace("+", "%20");
            String encodedPass = java.net.URLEncoder.encode(nvr.getPassword(), "UTF-8").replace("+", "%20");
            
            String nvrType = nvr.getType() != null ? nvr.getType().toLowerCase().replace(" ", "") : "";
            
            if (nvrType.contains("hikvision")) {
                java.time.format.DateTimeFormatter formatter = java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'");
                String startStr = start.format(formatter);
                String endStr = end.format(formatter);
                return String.format("rtsp://%s:%s@%s:%s/Streaming/tracks/%d01?starttime=%s&endtime=%s",
                    encodedUser, encodedPass, ip, port, channel, startStr, endStr);
            } else if (nvrType.contains("cpplus")) {
                java.time.format.DateTimeFormatter cpplusFormatter = java.time.format.DateTimeFormatter.ofPattern("yyyy_MM_dd_HH_mm_ss");
                String cpStartStr = start.format(cpplusFormatter);
                String cpEndStr = end.format(cpplusFormatter);
                return String.format("rtsp://%s:%s@%s:%s/cam/playback?channel=%d&subtype=0&starttime=%s&endtime=%s",
                    encodedUser, encodedPass, ip, port, channel, cpStartStr, cpEndStr);
            }
        } catch (Exception e) {
            log.error("Failed to build fallback RTSP playback URL", e);
        }
        
        return "rtsp://" + ip + "/playback?channel=" + channel;
    }

    @Override
    public String getPlaybackUrl(NVR nvr, int channel, String startTimeIso, String endTimeIso) {
        try {
            java.time.OffsetDateTime start = java.time.OffsetDateTime.parse(startTimeIso);
            java.time.OffsetDateTime end = java.time.OffsetDateTime.parse(endTimeIso);
            return buildFallbackRtspPlaybackUrl(nvr, channel, start, end);
        } catch (Exception e) {
            log.error("Failed to generate playback URL", e);
            return null;
        }
    }

    private List<PlaybackSegmentDto> getFallbackSegments(NVR nvr, int channel, String startTimeIso, String endTimeIso) {
        List<PlaybackSegmentDto> segments = new ArrayList<>();
        try {
            java.time.OffsetDateTime start = java.time.OffsetDateTime.parse(startTimeIso);
            java.time.OffsetDateTime end = java.time.OffsetDateTime.parse(endTimeIso);
            long duration = java.time.Duration.between(start, end).toSeconds();
            if (duration > 0) {
                String rtspPlaybackUrl = buildFallbackRtspPlaybackUrl(nvr, channel, start, end);
                segments.add(PlaybackSegmentDto.builder()
                        .startTime(startTimeIso)
                        .endTime(endTimeIso)
                        .duration(duration)
                        .url(rtspPlaybackUrl)
                        .recordType("continuous")
                        .build());
                log.info("ONVIF search returned 0 results for {} NVR. Generated fallback segment from {} to {} for playback support.",
                        nvr.getType(), startTimeIso, endTimeIso);
            }
        } catch (Exception ex) {
            log.error("Failed to build synthetic fallback playback segment", ex);
        }
        return segments;
    }
}
