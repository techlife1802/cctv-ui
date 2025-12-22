package com.cctv.api.service;

import com.cctv.api.model.NVR;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.bytedeco.ffmpeg.global.avutil;
import org.bytedeco.javacv.FFmpegLogCallback;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Slf4j
@Service
@RequiredArgsConstructor
public class HlsService {

    private final NvrService nvrService;
    private final Map<String, TranscodingSession> activeSessions = new ConcurrentHashMap<>();
    private final ExecutorService executorService = Executors.newCachedThreadPool();
    private static final String HLS_ROOT_DIR = "./tmp" + File.separator + "cctv_hls";

    // Enable FFmpeg logging globally
    static {
        FFmpegLogCallback.set();
        avutil.av_log_set_level(avutil.AV_LOG_INFO);
    }

    public Path getHlsPlaylistPath(String nvrId, int channelId) {
        return Paths.get(HLS_ROOT_DIR, getStreamId(nvrId, channelId), "index.m3u8");
    }

    public Path getHlsSegmentPath(String nvrId, int channelId, String segmentName) {
        return Paths.get(HLS_ROOT_DIR, getStreamId(nvrId, channelId), segmentName);
    }

    public void startStreamIfNotActive(String nvrId, int channelId) {
        String streamId = getStreamId(nvrId, channelId);
        if (activeSessions.containsKey(streamId)) {
            activeSessions.get(streamId).updateLastAccessed();
            return;
        }

        Path streamDir = Paths.get(HLS_ROOT_DIR, streamId);
        try {
            if (Files.exists(streamDir)) {
                Files.walk(streamDir)
                        .map(Path::toFile)
                        .sorted((o1, o2) -> -o1.compareTo(o2))
                        .forEach(File::delete);
            }
            Files.createDirectories(streamDir);
        } catch (IOException e) {
            log.error("Failed to create HLS directory", e);
            throw new RuntimeException("Could not initialize streaming directory", e);
        }

        NVR nvr = nvrService.getNvrById(nvrId);
        String rtspUrl = nvrService.generateStreamUrl(nvr, channelId);

        TranscodingSession session = new TranscodingSession(streamId, rtspUrl, streamDir.toString());
        activeSessions.put(streamId, session);
        executorService.submit(session);
    }

    @Scheduled(fixedRate = 10000)
    public void cleanupIdleSessions() {
        long now = System.currentTimeMillis();
        activeSessions.forEach((streamId, session) -> {
            if (now - session.getLastAccessed() > 30000) {
                log.info("Stopping idle HLS session: {}", streamId);
                session.stop();
                activeSessions.remove(streamId);
            }
        });
    }

    private String getStreamId(String nvrId, int channelId) {
        return nvrId + "_" + channelId;
    }

    @Slf4j
    private static class TranscodingSession implements Runnable {
        private final String streamId;
        private final String rtspUrl;
        private final String outputDir;
        private volatile long lastAccessed = System.currentTimeMillis();
        private volatile boolean running = true;
        private org.bytedeco.javacv.FFmpegFrameGrabber grabber;
        private org.bytedeco.javacv.FFmpegFrameRecorder recorder;

        public TranscodingSession(String streamId, String rtspUrl, String outputDir) {
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

        public void stop() {
            running = false;
            try {
                if (recorder != null) {
                    recorder.stop();
                    recorder.release();
                }
                if (grabber != null) {
                    grabber.stop();
                    grabber.release();
                }
            } catch (Exception e) {
                log.error("[{}] Error stopping transcoding session", streamId, e);
            }
        }

        @Override
        public void run() {
            try {
                log.info("[{}] Connecting to RTSP: {}", streamId, rtspUrl);

                String outputPath = outputDir + File.separator + "index.m3u8";
                log.info("[{}] Output path: {}", streamId, outputPath);

                // Initialize frame grabber for RTSP input
                grabber = new org.bytedeco.javacv.FFmpegFrameGrabber(rtspUrl);
                grabber.setOption("rtsp_transport", "tcp");
                grabber.setOption("stimeout", "5000000"); // 5 second timeout

                log.info("[{}] Starting frame grabber...", streamId);
                grabber.start();

                log.info("[{}] Stream info - Video codec: {}, Image width: {}, Image height: {}, Frame rate: {}",
                        streamId, grabber.getVideoCodec(), grabber.getImageWidth(),
                        grabber.getImageHeight(), grabber.getFrameRate());

                // Initialize frame recorder for HLS output
                recorder = new org.bytedeco.javacv.FFmpegFrameRecorder(outputPath, grabber.getImageWidth(),
                        grabber.getImageHeight());

                // Set video codec and encoding parameters
                recorder.setVideoCodec(org.bytedeco.ffmpeg.global.avcodec.AV_CODEC_ID_H264);
                recorder.setFormat("hls");
                recorder.setPixelFormat(org.bytedeco.ffmpeg.global.avutil.AV_PIX_FMT_YUV420P);
                recorder.setFrameRate(grabber.getFrameRate());
                recorder.setVideoBitrate(800000); // 800k

                // H.264 encoding options
                recorder.setVideoOption("preset", "ultrafast");
                recorder.setVideoOption("tune", "zerolatency");
                recorder.setVideoOption("g", "50"); // GOP size
                recorder.setVideoOption("sc_threshold", "0");
                recorder.setVideoOption("maxrate", "800k");
                recorder.setVideoOption("bufsize", "1600k");

                // HLS specific options
                recorder.setOption("hls_time", "2");
                recorder.setOption("hls_list_size", "5");
                recorder.setOption("hls_flags", "delete_segments+independent_segments");
                recorder.setOption("hls_segment_type", "mpegts");
                recorder.setOption("hls_segment_filename", outputDir + File.separator + "segment_%03d.ts");
                recorder.setOption("start_number", "0");

                log.info("[{}] Starting frame recorder...", streamId);
                recorder.start();

                log.info("[{}] HLS transcoding started successfully", streamId);

                // Frame processing loop
                org.bytedeco.javacv.Frame frame;
                long frameCount = 0;
                long lastLogTime = System.currentTimeMillis();

                while (running) {
                    try {
                        frame = grabber.grab();

                        if (frame == null) {
                            log.warn("[{}] Received null frame, stream may have ended", streamId);
                            break;
                        }

                        // Only process video frames
                        if (frame.image != null) {
                            recorder.record(frame);
                            frameCount++;

                            // Log progress every 5 seconds
                            long currentTime = System.currentTimeMillis();
                            if (currentTime - lastLogTime > 5000) {
                                log.info("[{}] Processed {} frames", streamId, frameCount);
                                lastLogTime = currentTime;
                            }
                        }

                    } catch (org.bytedeco.javacv.FrameGrabber.Exception e) {
                        log.error("[{}] Error grabbing frame: {}", streamId, e.getMessage());
                        break;
                    } catch (org.bytedeco.javacv.FrameRecorder.Exception e) {
                        log.error("[{}] Error recording frame: {}", streamId, e.getMessage());
                        break;
                    }
                }

                log.info("[{}] Frame processing completed. Total frames: {}", streamId, frameCount);

            } catch (org.bytedeco.javacv.FrameGrabber.Exception e) {
                log.error("[{}] Failed to start frame grabber: {}", streamId, e.getMessage(), e);
            } catch (org.bytedeco.javacv.FrameRecorder.Exception e) {
                log.error("[{}] Failed to start frame recorder: {}", streamId, e.getMessage(), e);
            } catch (Exception e) {
                log.error("[{}] Streaming error: {}", streamId, e.getMessage(), e);
            } finally {
                // Clean up resources
                try {
                    if (recorder != null) {
                        log.info("[{}] Stopping recorder...", streamId);
                        recorder.stop();
                        recorder.release();
                    }
                } catch (Exception e) {
                    log.error("[{}] Error stopping recorder", streamId, e);
                }

                try {
                    if (grabber != null) {
                        log.info("[{}] Stopping grabber...", streamId);
                        grabber.stop();
                        grabber.release();
                    }
                } catch (Exception e) {
                    log.error("[{}] Error stopping grabber", streamId, e);
                }

                log.info("[{}] Session ended", streamId);
            }
        }
    }
}
