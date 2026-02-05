package com.cctv.api.service;

import com.cctv.api.model.User;
import com.cctv.api.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;

    public List<User> getAllUsers() {
        log.debug("Fetching all users");
        return userRepository.findAll();
    }

    public User createUser(User user) {
        log.debug("Creating user: {}", user.getUsername());
        return userRepository.save(user);
    }

    public User updateUser(String id, User userDetails) {
        log.debug("Updating user: {}", id);
        User user = userRepository.findById(java.util.Objects.requireNonNull(id))
                .orElseThrow(() -> new RuntimeException("User not found"));
        user.setUsername(userDetails.getUsername());
        if (userDetails.getPassword() != null && !userDetails.getPassword().isEmpty()) {
            user.setPassword(userDetails.getPassword());
        }
        user.setRole(userDetails.getRole());
        user.setLocations(userDetails.getLocations());
        user.setAssignedCameraIds(userDetails.getAssignedCameraIds());
        return userRepository.save(user);
    }

    public void deleteUser(String id) {
        log.debug("Deleting user: {}", id);
        userRepository.deleteById(java.util.Objects.requireNonNull(id));
    }
}
