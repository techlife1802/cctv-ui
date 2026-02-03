package com.cctv.api.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;

public class DigestUtil {

    private DigestUtil() {
    }

    public static String digestHeader(String username, String password) {

        try {
            // Nonce (16 bytes)
            byte[] nonceBytes = new byte[16];
            new SecureRandom().nextBytes(nonceBytes);

            // Created (ISO-8601 UTC)
            String created = java.time.format.DateTimeFormatter.ISO_INSTANT.format(Instant.now());

            // PasswordDigest = Base64 ( SHA1 ( nonceBytes + createdBytes + passwordBytes )
            // )
            MessageDigest sha1 = MessageDigest.getInstance("SHA-1");
            sha1.update(nonceBytes);
            sha1.update(created.getBytes(StandardCharsets.UTF_8));
            sha1.update(password.getBytes(StandardCharsets.UTF_8));

            String passwordDigest = Base64.getEncoder().encodeToString(sha1.digest());
            String nonceBase64 = Base64.getEncoder().encodeToString(nonceBytes);

            return "<soap:Header>"
                    + "<wsse:Security soap:mustUnderstand=\"1\" "
                    + "xmlns:wsse=\"http://docs.oasis-open.org/wss/2004/01/"
                    + "oasis-200401-wss-wssecurity-secext-1.0.xsd\" "
                    + "xmlns:wsu=\"http://docs.oasis-open.org/wss/2004/01/"
                    + "oasis-200401-wss-wssecurity-utility-1.0.xsd\">"
                    + "<wsse:UsernameToken>"
                    + "<wsse:Username>" + username + "</wsse:Username>"
                    + "<wsse:Password "
                    + "Type=\"http://docs.oasis-open.org/wss/2004/01/"
                    + "oasis-200401-wss-username-token-profile-1.0#PasswordDigest\">"
                    + passwordDigest + "</wsse:Password>"
                    + "<wsse:Nonce "
                    + "EncodingType=\"http://docs.oasis-open.org/wss/2004/01/"
                    + "oasis-200401-wss-soap-message-security-1.0#Base64Binary\">"
                    + nonceBase64 + "</wsse:Nonce>"
                    + "<wsu:Created>" + created + "</wsu:Created>"
                    + "</wsse:UsernameToken>"
                    + "</wsse:Security>"
                    + "</soap:Header>";

        } catch (Exception e) {
            throw new RuntimeException("Failed to create ONVIF Digest header", e);
        }
    }
}
