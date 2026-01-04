package com.cctv.api.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.TimeUnit;

@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager cacheManager = new CaffeineCacheManager();
        
        // NVR cache - 10 minutes TTL, max 1000 entries
        cacheManager.registerCustomCache("nvrs", Caffeine.newBuilder()
                .expireAfterWrite(10, TimeUnit.MINUTES)
                .maximumSize(1000)
                .recordStats()
                .build());
        
        // Stream list cache - 1 minute TTL, max 500 entries
        cacheManager.registerCustomCache("streamLists", Caffeine.newBuilder()
                .expireAfterWrite(1, TimeUnit.MINUTES)
                .maximumSize(500)
                .recordStats()
                .build());
        
        // NVR by location cache - 5 minutes TTL
        cacheManager.registerCustomCache("nvrsByLocation", Caffeine.newBuilder()
                .expireAfterWrite(5, TimeUnit.MINUTES)
                .maximumSize(200)
                .recordStats()
                .build());
        
        return cacheManager;
    }
}

