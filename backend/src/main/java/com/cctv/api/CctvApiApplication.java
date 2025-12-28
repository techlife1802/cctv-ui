package com.cctv.api;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@Slf4j
@SpringBootApplication
public class CctvApiApplication {

    public static void main(String[] args) {
        log.info("Starting CCTV API Application...");
        SpringApplication.run(CctvApiApplication.class, args);
        log.info("CCTV API Application started successfully.");
    }

}