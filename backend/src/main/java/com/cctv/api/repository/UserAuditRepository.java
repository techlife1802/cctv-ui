package com.cctv.api.repository;

import com.cctv.api.model.UserAudit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface UserAuditRepository extends JpaRepository<UserAudit, String> {
    List<UserAudit> findByUsername(String username);

    List<UserAudit> findByUsernameAndAction(String username, String action);

    List<UserAudit> findByUsernameOrderByTimestampDesc(String username);

    List<UserAudit> findByTimestampBetween(LocalDateTime start, LocalDateTime end);
}
