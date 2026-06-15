package com.cctv.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Represents a single recorded video segment returned by the NVR.
 * Compatible with Hikvision ISAPI CMR search response format.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlaybackSegmentDto {

    /** ISO-8601 start time of the recording (e.g. "2024-06-15T10:00:00+05:30") */
    private String startTime;

    /** ISO-8601 end time of the recording */
    private String endTime;

    /** Duration in seconds */
    private long duration;

    /**
     * Direct RTSP playback URL for this segment.
     * For Hikvision: rtsp://user:pass@ip:port/Streaming/tracks/CHANNEL01?starttime=...&endtime=...
     */
    private String url;

    /** Optional thumbnail URL (may be null if NVR doesn't support it) */
    private String thumbnailUrl;

    /** Recording type: "continuous", "motion", "alarm", etc. */
    private String recordType;
}
