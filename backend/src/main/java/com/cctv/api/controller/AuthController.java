package com.cctv.api.controller;

import com.cctv.api.model.User;
import com.cctv.api.repository.UserRepository;
import com.cctv.api.service.UserAuditService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.HashMap;
import java.util.Map;
import java.util.Base64;

@Slf4j
@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class AuthController {

    private final UserRepository userRepository;
    private final UserAuditService userAuditService;

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> request, HttpServletRequest servletRequest) {
        String username = request.get("username");
        log.info("Attempting login for user: {}", username);
        String password = request.get("password");

        User user = userRepository.findByUsername(username)
                .orElse(null);

        if (user != null && user.getPassword().equals(password)) {
            String token = Base64.getEncoder().encodeToString((username + ":" + password).getBytes());
            Map<String, Object> response = new HashMap<>();
            response.put("user", user);
            response.put("token", "Basic " + token);

            // Log successful login
            userAuditService.logLogin(username, servletRequest.getRemoteAddr());

            log.info("Login successful for user: {}", username);
            return ResponseEntity.ok(response);
        }

        log.warn("Login failed for user: {}", username);

        return ResponseEntity.status(401).body("Invalid credentials");
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(Principal principal) {
        if (principal == null)
            return ResponseEntity.status(401).build();
        return ResponseEntity.ok(userRepository.findByUsername(principal.getName()));
    }
}
