package com.cctv.api.service;

import com.cctv.api.dto.PlaybackSegmentDto;
import com.cctv.api.model.NVR;

import java.util.List;

public interface PlaybackProvider {
    /**
     * Determines if this provider is applicable for the given NVR.
     */
    boolean supports(NVR nvr);

    /**
     * Searches for recordings on a specific channel within a time window.
     */
    List<PlaybackSegmentDto> searchRecordings(NVR nvr, int channel, String startTimeIso, String endTimeIso);

    /**
     * Generates a direct RTSP playback URL for a specific time window.
     */
    String getPlaybackUrl(NVR nvr, int channel, String startTimeIso, String endTimeIso);
}
