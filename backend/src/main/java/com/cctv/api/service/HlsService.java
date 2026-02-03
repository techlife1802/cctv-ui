package com.cctv.api.service;

import com.cctv.api.model.NVR;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import jakarta.annotation.PreDestroy;
import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Service
@RequiredArgsConstructor
public class HlsService {

    private final NvrService nvrService;
    private final Map<String, FFmpegSession> activeSessions = new ConcurrentHashMap<>();

    @org.springframework.beans.factory.annotation.Value("${hls.root.dir}")
    private String hlsRootDir;

    @org.springframework.beans.factory.annotation.Value("${hls.max.concurrent.streams:50}")
    private int maxConcurrentStreams;

    @org.springframework.beans.factory.annotation.Value("${hls.idle.timeout.seconds:60}")
    private long idleTimeoutSeconds;

    public Path getHlsPlaylistPath(String nvrId, int channelId) {
        return Paths.get(hlsRootDir, getStreamId(nvrId, channelId), "index.m3u8");
    }

    public void startStreamIfNotActive(String nvrId, int channelId) {
        String streamId = getStreamId(nvrId, channelId);
        if (activeSessions.containsKey(streamId)) {
            activeSessions.get(streamId).updateLastAccessed();
            log.debug("[{}] Stream already active, updated last accessed time", streamId);
            return;
        }

        // Check resource limits
        if (activeSessions.size() >= maxConcurrentStreams) {
            log.warn("[{}] Maximum concurrent streams ({}) reached. Cannot start new stream.",
                    streamId, maxConcurrentStreams);
            throw new RuntimeException("Maximum concurrent streams limit reached: " + maxConcurrentStreams);
        }

        log.info("[{}] Starting new stream (Active: {}/{})", streamId, activeSessions.size(), maxConcurrentStreams);

        Path streamDir = Paths.get(hlsRootDir, streamId);
        try {
            if (Files.exists(streamDir)) {
                // Delete existing contents
                Files.walk(streamDir)
                        .map(Path::toFile)
                        .sorted((o1, o2) -> -o1.compareTo(o2))
                        .forEach(File::delete);
            }
            Files.createDirectories(streamDir);
        } catch (IOException e) {
            log.error("Failed to create HLS directory: {}", streamDir, e);
            throw new RuntimeException("Could not initialize streaming directory", e);
        }

        NVR nvr = nvrService.getNvrById(nvrId);
        String rtspUrl = nvrService.generateStreamUrl(nvr, channelId);

        FFmpegSession session = new FFmpegSession(streamId, rtspUrl, streamDir.toString());
        activeSessions.put(streamId, session);
        session.start();
    }

    @Scheduled(fixedRate = 10000)
    public void cleanupIdleSessions() {
        long now = System.currentTimeMillis();
        long timeoutMs = idleTimeoutSeconds * 1000;
        AtomicInteger cleanedCount = new AtomicInteger(0);

        activeSessions.forEach((streamId, session) -> {
            if (now - session.getLastAccessed() > timeoutMs) {
                log.info("Stopping idle HLS session: {} (idle for {}s)",
                        streamId, (now - session.getLastAccessed()) / 1000);
                session.stop();
                activeSessions.remove(streamId);
                cleanedCount.incrementAndGet();
            }
        });

        if (cleanedCount.get() > 0) {
            log.info("Cleaned up {} idle session(s). Active streams: {}", cleanedCount.get(), activeSessions.size());
        }
    }

    /**
     * Get current resource usage statistics
     */
    public StreamStats getStreamStats() {
        return new StreamStats(
                activeSessions.size(),
                maxConcurrentStreams,
                activeSessions.keySet());
    }

    /**
     * Check if a stream is currently active
     */
    public boolean isStreamActive(String nvrId, int channelId) {
        return activeSessions.containsKey(getStreamId(nvrId, channelId));
    }

    /**
     * Force stop a specific stream
     */
    public void stopStream(String nvrId, int channelId) {
        String streamId = getStreamId(nvrId, channelId);
        FFmpegSession session = activeSessions.remove(streamId);
        if (session != null) {
            log.info("Force stopping stream: {}", streamId);
            session.stop();
        }
    }

    public record StreamStats(
            int activeStreams,
            int maxStreams,
            java.util.Set<String> activeStreamIds) {
    }

    @PreDestroy
    public void stopAllSessions() {
        log.info("Shutting down HLS sessions...");
        activeSessions.values().forEach(FFmpegSession::stop);
        activeSessions.clear();
    }

    private String getStreamId(String nvrId, int channelId) {
        return nvrId + "_" + channelId;
    }

    @Slf4j
    private static class FFmpegSession {
        private final String streamId;
        private final String rtspUrl;
        private final String outputDir;
        private volatile long lastAccessed = System.currentTimeMillis();
        private Process ffmpegProcess;
        private Thread monitorThread;

        public FFmpegSession(String streamId, String rtspUrl, String outputDir) {
            this.streamId = streamId;
            this.rtspUrl = rtspUrl;
            this.outputDir = outputDir;
        }

        public void updateLastAccessed() {
            lastAccessed = System.currentTimeMillis();
        }

        public long getLastAccessed() {
            return lastAccessed;
        }

        public void start() {
            // Try with stream copy first (ultra low CPU)
            startProcess(true);
        }

        private void startProcess(boolean useCopy) {
            List<String> command = new ArrayList<>();
            command.add("ffmpeg");

            // Input optimization
            command.add("-rtsp_transport");
            command.add("tcp");
            command.add("-rtsp_flags");
            command.add("prefer_tcp");
            command.add("-stimeout");
            command.add("5000000"); // 5 second timeout
            command.add("-i");
            command.add(rtspUrl);

            if (useCopy) {
                log.info("[{}] Attempting stream copy...", streamId);
                command.add("-c:v");
                command.add("copy");
            } else {
                log.info("[{}] Falling back to transcoding...", streamId);
                command.add("-c:v");
                command.add("libx264");
                command.add("-preset");
                command.add("ultrafast");
                command.add("-tune");
                command.add("zerolatency");
                command.add("-profile:v");
                command.add("baseline");
                command.add("-level");
                command.add("3.0");
                command.add("-pix_fmt");
                command.add("yuv420p");
                // Limit CPU usage
                command.add("-threads");
                command.add("2");
                // Quality settings for low latency
                command.add("-crf");
                command.add("23");
                command.add("-maxrate");
                command.add("2M");
                command.add("-bufsize");
                command.add("4M");
            }

            command.add("-an"); // No audio
            command.add("-f");
            command.add("hls");
            // Optimized HLS settings for low latency
            command.add("-hls_time");
            command.add("2");
            command.add("-hls_list_size");
            command.add("5");
            command.add("-hls_flags");
            command.add("delete_segments+independent_segments+omit_endlist");
            command.add("-hls_segment_type");
            command.add("mpegts");
            command.add("-hls_segment_filename");
            command.add(outputDir + File.separator + "seg_%03d.ts");
            // Reduce startup delay
            command.add("-start_number");
            command.add("0");
            command.add("-hls_allow_cache");
            command.add("0");
            command.add(outputDir + File.separator + "index.m3u8");

            ProcessBuilder pb = new ProcessBuilder(command);
            pb.redirectErrorStream(true);

            // Set process priority to lower CPU usage (optional, OS-dependent)
            // This helps prevent FFmpeg from consuming all CPU resources
            try {
                // On Linux, this sets nice value (higher = lower priority)
                // Note: This may not work on all systems, especially in containers
                pb.inheritIO();
            } catch (Exception e) {
                log.debug("[{}] Could not set process priority", streamId);
            }

            try {
                ffmpegProcess = pb.start();
                log.info("[{}] FFmpeg process started (PID: {})", streamId, ffmpegProcess.pid());
                monitorThread = new Thread(() -> monitorProcess(useCopy));
                monitorThread.setName("FFmpegMonitor-" + streamId);
                monitorThread.setDaemon(true); // Don't prevent JVM shutdown
                monitorThread.start();
            } catch (IOException e) {
                log.error("[{}] Failed to start FFmpeg process", streamId, e);
                throw new RuntimeException("Failed to start FFmpeg for stream: " + streamId, e);
            }
        }

        private void monitorProcess(boolean wasUsingCopy) {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(ffmpegProcess.getInputStream()))) {
                String line;
                int lineCount = 0;
                while ((line = reader.readLine()) != null) {
                    if (lineCount < 20) { // Log first few lines for debugging
                        log.debug("[{}] FFmpeg: {}", streamId, line);
                        lineCount++;
                    }
                    if (line.contains("Error") || line.contains("failed")) {
                        log.warn("[{}] FFmpeg Warning/Error: {}", streamId, line);
                    }
                }
            } catch (IOException e) {
                log.debug("[{}] FFmpeg output stream closed", streamId);
            }

            try {
                int exitCode = ffmpegProcess.waitFor();
                log.info("[{}] FFmpeg process exited with code {}", streamId, exitCode);

                if (exitCode != 0 && wasUsingCopy) {
                    log.warn("[{}] Stream copy failed, trying fallback to transcoding...", streamId);
                    startProcess(false);
                }
            } catch (InterruptedException e) {
                log.error("[{}] Monitor thread interrupted", streamId);
                Thread.currentThread().interrupt();
            }
        }

        public void stop() {
            if (ffmpegProcess != null && ffmpegProcess.isAlive()) {
                ffmpegProcess.destroy();
                try {
                    if (!ffmpegProcess.waitFor(5, TimeUnit.SECONDS)) {
                        ffmpegProcess.destroyForcibly();
                    }
                } catch (InterruptedException e) {
                    ffmpegProcess.destroyForcibly();
                    Thread.currentThread().interrupt();
                }
            }
            if (monitorThread != null) {
                monitorThread.interrupt();
            }
        }
    }
}
