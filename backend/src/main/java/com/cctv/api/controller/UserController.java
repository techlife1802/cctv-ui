package com.cctv.api.controller;

import com.cctv.api.model.User;
import com.cctv.api.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.List;

import com.cctv.api.dto.ChangePasswordRequest;
import com.cctv.api.dto.ChangePasswordResponse;

@Slf4j
@RestController
@RequestMapping("/api/users")
@CrossOrigin(origins = "*")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @GetMapping
    public List<User> getAllUsers() {
        return userService.getAllUsers();
    }

    @PostMapping
    public ResponseEntity<User> createUser(@RequestBody User user) {
        log.info("Request to create user: {}", user.getUsername());
        return ResponseEntity.ok(userService.createUser(user));
    }

    @PutMapping("/{id}")
    public ResponseEntity<User> updateUser(@PathVariable String id, @RequestBody User user) {
        log.info("Request to update user: {}", id);
        return ResponseEntity.ok(userService.updateUser(id, user));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable String id) {
        log.info("Request to delete user: {}", id);
        userService.deleteUser(id);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/change-password")
    @PreAuthorize("isAuthenticated()") // Any authenticated user can change their own password
    public ResponseEntity<ChangePasswordResponse> changePassword(
            @RequestBody ChangePasswordRequest request,
            Principal principal) {
        log.info("Password change request from user: {}", principal.getName());

        try {
            boolean success = userService.changePassword(
                    principal.getName(),
                    request.getCurrentPassword(),
                    request.getNewPassword());

            if (success) {
                return ResponseEntity.ok(new ChangePasswordResponse(true, "Password changed successfully"));
            } else {
                return ResponseEntity.badRequest()
                        .body(new ChangePasswordResponse(false, "Current password is incorrect"));
            }
        } catch (Exception e) {
            log.error("Error changing password for user: {}", principal.getName(), e);
            return ResponseEntity.internalServerError()
                    .body(new ChangePasswordResponse(false, "Failed to change password. Please try again."));
        }
    }
}
