package com.cctv.api.service;

import com.cctv.api.model.AuditAction;
import com.cctv.api.model.UserAudit;
import com.cctv.api.repository.UserAuditRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserAuditService {

    private final UserAuditRepository userAuditRepository;

    public void logLogin(String username, String ipAddress) {
        log.info("[logLogin] Logging login for user: {}, IP: {}", username, ipAddress);

        UserAudit audit = new UserAudit();
        audit.setUsername(username);
        audit.setAction(AuditAction.LOGIN);
        audit.setIpAddress(ipAddress);

        userAuditRepository.save(audit);
        log.debug("[logLogin] Login audit entry created for user: {}", username);
    }

    public void logLocationView(String username, String location, String ipAddress) {
        log.info("[logLocationView] Logging location view for user: {}, Location: {}, IP: {}",
                username, location, ipAddress);

        UserAudit audit = new UserAudit();
        audit.setUsername(username);
        audit.setAction(AuditAction.VIEW_LOCATION);
        audit.setLocation(location);
        audit.setIpAddress(ipAddress);

        userAuditRepository.save(audit);
        log.debug("[logLocationView] Location view audit entry created for user: {}", username);
    }

    public void logNvrAccess(String username, String nvrId, String ipAddress) {
        log.info("[logNvrAccess] Logging NVR access for user: {}, NVR: {}, IP: {}",
                username, nvrId, ipAddress);

        UserAudit audit = new UserAudit();
        audit.setUsername(username);
        audit.setAction(AuditAction.VIEW_NVR);
        audit.setNvrId(nvrId);
        audit.setIpAddress(ipAddress);

        userAuditRepository.save(audit);
        log.debug("[logNvrAccess] NVR access audit entry created for user: {}", username);
    }

    public List<UserAudit> getUserAuditHistory(String username) {
        log.info("[getUserAuditHistory] Fetching audit history for user: {}", username);
        List<UserAudit> history = userAuditRepository.findByUsernameOrderByTimestampDesc(username);
        log.info("[getUserAuditHistory] Retrieved {} audit entries for user: {}", history.size(), username);
        return history;
    }

    public List<UserAudit> getUserLoginHistory(String username) {
        log.info("[getUserLoginHistory] Fetching login history for user: {}", username);
        List<UserAudit> history = userAuditRepository.findByUsernameAndAction(username, AuditAction.LOGIN);
        log.info("[getUserLoginHistory] Retrieved {} login entries for user: {}", history.size(), username);
        return history;
    }

    public List<UserAudit> getAuditEntriesBetween(LocalDateTime start, LocalDateTime end) {
        log.info("[getAuditEntriesBetween] Fetching audit entries between {} and {}", start, end);
        List<UserAudit> entries = userAuditRepository.findByTimestampBetween(start, end);
        log.info("[getAuditEntriesBetween] Retrieved {} audit entries", entries.size());
        return entries;
    }
}
