package com.cctv.api.service;

import com.cctv.api.dto.OnvifCameraDto;
import com.cctv.api.model.NVR;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.w3c.dom.Document;
import org.w3c.dom.NodeList;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.xpath.XPath;
import javax.xml.xpath.XPathConstants;
import javax.xml.xpath.XPathFactory;
import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
public class OnvifService {

    private final WebClient webClient;

    public OnvifService(WebClient.Builder webClientBuilder) {
        this.webClient = webClientBuilder.build();
    }

    public List<OnvifCameraDto> testAndDiscover(NVR nvr) {
        String ip = nvr.getIp();
        String port = (nvr.getOnvifPort() != null && !nvr.getOnvifPort().isEmpty()) ? nvr.getOnvifPort() : "80";
        String user = (nvr.getOnvifUsername() != null && !nvr.getOnvifUsername().isEmpty()) ? nvr.getOnvifUsername()
                : nvr.getUsername();
        String pass = (nvr.getOnvifPassword() != null && !nvr.getOnvifPassword().isEmpty()) ? nvr.getOnvifPassword()
                : nvr.getPassword();
        String name = nvr.getName() != null ? nvr.getName() : "New NVR";

        log.info("Starting ONVIF discovery for NVR: {} at {}:{}", name, ip, port);

        if ("554".equals(port)) {
            log.warn("Port 554 is typically for RTSP, not ONVIF. Discovery might fail or hang.");
        }

        List<OnvifCameraDto> discoveredCameras = new ArrayList<>();
        try {
            // 1. Get Device Information (verifies credentials and ONVIF support)
            String devInfoResponse = sendSoapRequest(ip, port, user, pass, getDeviceInformationRequest());
            if (devInfoResponse == null) {
                throw new RuntimeException("Failed to get device information (check IP/Port and ONVIF support)");
            }

            // 2. Get Profiles
            String profilesResponse = sendSoapRequest(ip, port, user, pass, getProfilesRequest());
            if (profilesResponse == null) {
                throw new RuntimeException("Failed to get profiles (authentication or service error)");
            }

            discoveredCameras = parseProfiles(profilesResponse, ip, port, user, pass);

        } catch (Exception e) {
            log.error("ONVIF discovery failed for {}", ip, e);
            throw new RuntimeException(e.getMessage());
        }

        return discoveredCameras;
    }

    private String sendSoapRequest(String ip, String port, String user, String pass, String xmlBody) {
        try {
            String fullXml = wrapInSoapEnvelope(xmlBody, user, pass);
            String url = String.format("http://%s:%s/onvif/device_service", ip, port);

            log.debug("Sending SOAP request to {}", url);

            String response = webClient.post()
                    .uri(url)
                    .header("Content-Type", "application/soap+xml; charset=utf-8")
                    .bodyValue(fullXml)
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(java.time.Duration.ofSeconds(10))
                    .block();
            log.info("Onvif Response is {}", response);
            return response != null ? response : "";
        } catch (Exception e) {
            log.warn("SOAP request failed for {}: {}", ip, e.getMessage());
            // Try /onvif/media_service as fallback for profile requests
            if (xmlBody.contains("GetProfiles") || xmlBody.contains("GetStreamUri")) {
                try {
                    String fullXml = wrapInSoapEnvelope(xmlBody, user, pass);
                    String url = String.format("http://%s:%s/onvif/media_service", ip, port);
                    log.debug("Trying fallback SOAP request to {}", url);
                    String response = webClient.post()
                            .uri(url)
                            .header("Content-Type", "application/soap+xml; charset=utf-8")
                            .bodyValue(fullXml)
                            .retrieve()
                            .bodyToMono(String.class)
                            .timeout(java.time.Duration.ofSeconds(10))
                            .block();
                    return response != null ? response : "";
                } catch (Exception ex) {
                    log.error("Fallback SOAP request also failed for {}", ip, ex.getMessage());
                }
            }
            return null;
        }
    }

    private String wrapInSoapEnvelope(String body, String user, String pass) {
        StringBuilder sb = new StringBuilder();
        sb.append("<?xml version=\"1.0\" encoding=\"utf-8\"?>");
        sb.append("<soap:Envelope xmlns:soap=\"http://www.w3.org/2003/05/soap-envelope\" ");
        sb.append("xmlns:tds=\"http://www.onvif.org/ver10/device/wsdl\" ");
        sb.append("xmlns:trt=\"http://www.onvif.org/ver10/media/wsdl\" ");
        sb.append("xmlns:tt=\"http://www.onvif.org/ver10/schema\">");

        if (user != null && !user.isEmpty()) {
            sb.append("<soap:Header>");
            sb.append(
                    "<Security xmlns=\"http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd\">");
            sb.append("<UsernameToken>");
            sb.append("<Username>").append(user).append("</Username>");
            sb.append(
                    "<Password Type=\"http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText\">");
            sb.append(pass != null ? pass : "");
            sb.append("</Password>");
            sb.append("</UsernameToken>");
            sb.append("</Security>");
            sb.append("</soap:Header>");
        }

        sb.append("<soap:Body>").append(body).append("</soap:Body>");
        sb.append("</soap:Envelope>");
        return sb.toString();
    }

    private List<OnvifCameraDto> parseProfiles(String xml, String ip, String port, String user, String pass)
            throws Exception {
        List<OnvifCameraDto> cameras = new ArrayList<>();
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        DocumentBuilder builder = factory.newDocumentBuilder();
        Document doc = builder.parse(new ByteArrayInputStream(xml.getBytes()));

        XPathFactory xPathfactory = XPathFactory.newInstance();
        XPath xpath = xPathfactory.newXPath();

        // Profiles are usually under Name and token
        NodeList profileNodes = (NodeList) xpath.evaluate("//*[local-name()='Profiles']", doc, XPathConstants.NODESET);

        for (int i = 0; i < profileNodes.getLength(); i++) {
            Object nameObj = xpath.evaluate(".//*[local-name()='Name']", profileNodes.item(i), XPathConstants.STRING);
            String name = nameObj != null && !nameObj.toString().isEmpty() ? nameObj.toString() : "Camera " + (i + 1);

            Object tokenObj = xpath.evaluate("./@token", profileNodes.item(i), XPathConstants.STRING);
            String token = tokenObj != null ? tokenObj.toString() : "";

            if (token != null && !token.isEmpty()) {
                String streamUri = getStreamUri(ip, port, user, pass, token);
                cameras.add(OnvifCameraDto.builder()
                        .name(name)
                        .channel(i + 1)
                        .profileToken(token)
                        .streamUri(streamUri)
                        .status("Online")
                        .build());
            }
        }
        return cameras;
    }

    private String getStreamUri(String ip, String port, String user, String pass, String profileToken) {
        String request = getStreamUriRequest(profileToken);
        String response = sendSoapRequest(ip, port, user, pass, request);
        if (response != null) {
            try {
                DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
                factory.setNamespaceAware(true);
                DocumentBuilder builder = factory.newDocumentBuilder();
                Document doc = builder.parse(new ByteArrayInputStream(response.getBytes()));
                XPath xpath = XPathFactory.newInstance().newXPath();
                Object uriObj = xpath.evaluate("//*[local-name()='Uri']", doc, XPathConstants.STRING);
                return uriObj != null ? uriObj.toString() : "";
            } catch (Exception e) {
                log.warn("Failed to parse Stream URI for token {}", profileToken);
            }
        }
        return "";
    }

    private String getDeviceInformationRequest() {
        return "<tds:GetDeviceInformation/>";
    }

    private String getProfilesRequest() {
        return "<trt:GetProfiles/>";
    }

    private String getStreamUriRequest(String profileToken) {
        return "<trt:GetStreamUri>" +
                "<trt:StreamSetup><tt:Stream>RTP-Unicast</tt:Stream><tt:Transport><tt:Protocol>RTSP</tt:Protocol></tt:Transport></trt:StreamSetup>"
                +
                "<trt:ProfileToken>" + profileToken + "</trt:ProfileToken>" +
                "</trt:GetStreamUri>";
    }
}
