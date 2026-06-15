import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Modal, Button, DatePicker, Select, Spin, message, Slider, Tooltip } from 'antd';
import {
    PlayCircleOutlined, PauseCircleOutlined, DownloadOutlined,
    ClockCircleOutlined, VideoCameraOutlined, SearchOutlined,
    StopOutlined, WarningOutlined, CalendarOutlined
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { Camera, PlaybackSegment, StreamInfo } from '../../types';
import { recordingService, streamService } from '../../services/apiService';
import { startRecording, captureStreamFromVideo, RecordingSession } from '../../utils/recordUtils';
import WebRtcPlayer from '../WebRtcPlayer/WebRtcPlayer';
import { logger } from '../../utils/logger';
import './PlaybackModal.scss';

dayjs.extend(duration);

interface PlaybackModalProps {
    open: boolean;
    camera: Camera | null;
    onClose: () => void;
}

type DurationOption = 1 | 2 | 4 | 8;

const DURATION_OPTIONS: { label: string; value: DurationOption }[] = [
    { label: '1 Hour', value: 1 },
    { label: '2 Hours', value: 2 },
    { label: '4 Hours', value: 4 },
    { label: '8 Hours', value: 8 },
];

const CLIP_OPTIONS = [
    { label: '30 sec', value: 30 },
    { label: '1 min', value: 60 },
    { label: '2 min', value: 120 },
    { label: '5 min', value: 300 },
    { label: '10 min', value: 600 },
];

/** Format seconds → HH:MM:SS */
const formatTime = (secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
};

const PlaybackModal: React.FC<PlaybackModalProps> = ({ open, camera, onClose }) => {
    // ── Controls state ──────────────────────────────────────────────────────────
    const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
    const [startHour, setStartHour] = useState<number>(dayjs().subtract(1, 'hour').hour());
    const [windowHours, setWindowHours] = useState<DurationOption>(1);
    const [clipDuration, setClipDuration] = useState<number>(60);

    // ── Data state ──────────────────────────────────────────────────────────────
    const [segments, setSegments] = useState<PlaybackSegment[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [activeSegment, setActiveSegment] = useState<PlaybackSegment | null>(null);
    const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
    const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
    const [playbackCursor, setPlaybackCursor] = useState<string | null>(null);
    const [playbackStartTime, setPlaybackStartTime] = useState<string | null>(null);

    // ── Player state ────────────────────────────────────────────────────────────
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [videoDuration, setVideoDuration] = useState(0);
    const [isBuffering, setIsBuffering] = useState(false);
    const [videoError, setVideoError] = useState<string | null>(null);

    // ── Clip recording state ─────────────────────────────────────────────────
    const [isRecordingClip, setIsRecordingClip] = useState(false);
    const [clipCountdown, setClipCountdown] = useState(0);

    const videoRef = useRef<HTMLVideoElement>(null);
    const recordingSessionRef = useRef<RecordingSession | null>(null);
    const clipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const clipIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Reset on close / camera change ──────────────────────────────────────────
    const stopClipTimer = useCallback(() => {
        if (clipTimerRef.current) {
            clearTimeout(clipTimerRef.current);
            clipTimerRef.current = null;
        }
        if (clipIntervalRef.current) {
            clearInterval(clipIntervalRef.current);
            clipIntervalRef.current = null;
        }
    }, []);

    // Reset state on open and load live stream
    useEffect(() => {
        if (open) {
            setSegments([]);
            setActiveSegment(null);
            setPlaybackUrl(null);
            setStreamInfo(null);
            setPlaybackCursor(null);
            setPlaybackStartTime(null);
            setHasSearched(false);
            setVideoError(null);
            setIsPlaying(false);
            setCurrentTime(0);
            setVideoDuration(0);
            setIsRecordingClip(false);
            setClipCountdown(0);
            stopClipTimer();
            if (recordingSessionRef.current) {
                recordingSessionRef.current.stop();
                recordingSessionRef.current = null;
            }
            if (videoRef.current) {
                videoRef.current.src = '';
                videoRef.current.load();
            }

            // Auto-load live stream for context
            if (camera) {
                setIsBuffering(true);
                streamService.getStreamInfo(camera.nvrId, camera.channelId)
                    .then(info => {
                        if (info && info.webRtcUrl) {
                            setStreamInfo(info);
                        }
                    })
                    .catch(err => {
                        logger.error("Failed to load initial live stream", err);
                    })
                    .finally(() => {
                        setIsBuffering(false);
                    });
            }
        }
    }, [open, camera, stopClipTimer]);

    // ── Derived window ───────────────────────────────────────────────────────────
    const windowStart = selectedDate
        .hour(startHour).minute(0).second(0).millisecond(0);
    const windowEnd = windowStart.add(windowHours, 'hour');

    // ── Search for recordings ────────────────────────────────────────────────────
    const handleSearch = useCallback(async () => {
        if (!camera) return;
        setIsSearching(true);
        setHasSearched(false);
        setSegments([]);
        setActiveSegment(null);
        setPlaybackUrl(null);
        setStreamInfo(null);
        setPlaybackCursor(null);
        setPlaybackStartTime(null);
        setVideoError(null);

        try {
            const results = await recordingService.getRecordings(
                camera.nvrId,
                camera.channelId,
                windowStart.format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
                windowEnd.format('YYYY-MM-DDTHH:mm:ss.SSSZ')
            );
            
            // Clip segments to the search window bounds
            const clippedResults = results.map(seg => {
                const segStart = dayjs(seg.startTime);
                const segEnd = dayjs(seg.endTime);
                
                // If segment completely outside window, keep as is (though backend shouldn't return it)
                if (segEnd.isBefore(windowStart) || segStart.isAfter(windowEnd)) return seg;
                
                const clippedStart = segStart.isBefore(windowStart) ? windowStart : segStart;
                const clippedEnd = segEnd.isAfter(windowEnd) ? windowEnd : segEnd;
                
                return {
                    ...seg,
                    startTime: clippedStart.format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
                    endTime: clippedEnd.format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
                    duration: clippedEnd.diff(clippedStart, 'second')
                };
            }).filter(seg => seg.duration > 0);
            
            setSegments(clippedResults);
            setHasSearched(true);
        } catch (err) {
            logger.error('Playback search failed', err);
            setSegments([]);
            setHasSearched(true);
        } finally {
            setIsSearching(false);
        }
    }, [camera, windowStart, windowEnd]);

    // ── Load a segment for playback ──────────────────────────────────────────────
    const handleSegmentClick = useCallback(async (seg: PlaybackSegment, clickedTimeIso?: string) => {
        const playbackStart = clickedTimeIso || seg.startTime;
        setPlaybackStartTime(playbackStart);
        setPlaybackCursor(playbackStart);
        setActiveSegment(seg);
        setVideoError(null);
        setIsBuffering(true);
        setPlaybackUrl(null);
        setStreamInfo(null);

        if (seg.url && !seg.url.startsWith('rtsp')) {
            // Direct HTTP video URL (MP4)
            setPlaybackUrl(seg.url);
            return;
        }

        // Try to get a playback stream from the backend
        // Use the precise clicked time if provided, otherwise default to segment start
        
        if (camera) {
            const info = await recordingService.getRecordingUrl(
                camera.nvrId,
                camera.channelId,
                playbackStart,
                seg.endTime
            );
            if (info && info.webRtcUrl) {
                setStreamInfo(info);
                setIsBuffering(false); // WebRtcPlayer handles its own loading state
            } else {
                setVideoError('No playback stream available for this time.');
                setIsBuffering(false);
            }
        }
    }, [camera]);

    // ── Set video src when URL changes ───────────────────────────────────────────
    useEffect(() => {
        if (playbackUrl && videoRef.current) {
            videoRef.current.src = playbackUrl;
            videoRef.current.load();
            videoRef.current.play().catch(() => setIsPlaying(false));
        }
    }, [playbackUrl]);

    // ── Video event handlers ─────────────────────────────────────────────────────
    const handleVideoPlay = () => setIsPlaying(true);
    const handleVideoPause = () => setIsPlaying(false);
    const handleTimeUpdate = () => {
        if (videoRef.current) {
            const time = videoRef.current.currentTime;
            setCurrentTime(time);
            if (activeSegment) {
                const baseTime = playbackStartTime || activeSegment.startTime;
                const newCursor = dayjs(baseTime).add(time, 'second').format('YYYY-MM-DDTHH:mm:ss.SSSZ');
                setPlaybackCursor(newCursor);
            }
        }
    };
    const handleDurationChange = () => {
        if (videoRef.current) setVideoDuration(videoRef.current.duration);
    };
    const handleVideoCanPlay = () => setIsBuffering(false);
    const handleVideoWaiting = () => setIsBuffering(true);
    const handleVideoError = () => {
        setVideoError('Failed to load the recording. The stream might be offline.');
        setIsBuffering(false);
    };

    const handlePlayPause = () => {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
        } else {
            videoRef.current.play().catch(() => {});
        }
    };

    const handleSeek = (value: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime = value;
            setCurrentTime(value);
        }
    };

    // ── Clip recording ───────────────────────────────────────────────────────────
    const handleStartClipRecording = () => {
        const video = videoRef.current;
        if (!video) {
            message.error('No video to record');
            return;
        }

        const stream = captureStreamFromVideo(video);
        if (!stream) {
            message.error('Could not capture video stream');
            return;
        }

        const segmentLabel = activeSegment
            ? dayjs(activeSegment.startTime).format('YYYY-MM-DD_HH-mm-ss')
            : 'playback';
        const label = `${camera?.name || 'camera'}_${segmentLabel}`;

        const session = startRecording(stream, label);
        recordingSessionRef.current = session;
        setIsRecordingClip(true);
        setClipCountdown(clipDuration);

        // Countdown tick
        clipIntervalRef.current = setInterval(() => {
            setClipCountdown(prev => {
                if (prev <= 1) return 0;
                return prev - 1;
            });
        }, 1000);

        // Auto-stop after duration
        clipTimerRef.current = setTimeout(() => {
            stopClipRecording(label);
        }, clipDuration * 1000);

        message.info(`Recording ${clipDuration}s clip from playback...`);
    };

    const stopClipRecording = useCallback((label?: string) => {
        stopClipTimer();
        if (recordingSessionRef.current) {
            recordingSessionRef.current.stop();
            recordingSessionRef.current = null;
        }
        setIsRecordingClip(false);
        setClipCountdown(0);
        message.success(`Clip saved: ${label || 'playback clip'}`);
    }, [stopClipTimer]);

    const handleStopClip = () => {
        const segLabel = activeSegment
            ? dayjs(activeSegment.startTime).format('YYYY-MM-DD_HH-mm-ss')
            : 'playback';
        stopClipRecording(`${camera?.name || 'camera'}_${segLabel}`);
    };

    // ── Timeline bar ─────────────────────────────────────────────────────────────
    const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (segments.length === 0) return;
        
        const trackRect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - trackRect.left;
        const percentage = Math.max(0, Math.min(1, clickX / trackRect.width));
        
        const totalMs = windowEnd.diff(windowStart);
        const clickedMs = percentage * totalMs;
        const clickedTime = windowStart.add(clickedMs, 'millisecond');
        
        // Find if this click falls within any segment
        const clickedSeg = segments.find(seg => {
            const start = dayjs(seg.startTime);
            const end = dayjs(seg.endTime);
            return (clickedTime.isAfter(start) || clickedTime.isSame(start)) && 
                   (clickedTime.isBefore(end) || clickedTime.isSame(end));
        });

        if (clickedSeg) {
            const localClickedTime = clickedTime.format('YYYY-MM-DDTHH:mm:ss.SSSZ');
            setPlaybackCursor(localClickedTime);
            handleSegmentClick(clickedSeg, localClickedTime);
        }
    };

    const renderTimeline = () => {
        const totalMs = windowEnd.diff(windowStart);
        const slots = windowHours * 4; // 15-min slots

        return (
            <div className="pb-timeline">
                <div className="pb-timeline-track" onClick={handleTimelineClick} style={{ cursor: segments.length > 0 ? 'pointer' : 'default' }}>
                    {segments.map((seg, i) => {
                        const segStart = dayjs(seg.startTime);
                        const segEnd = dayjs(seg.endTime);
                        const left = ((segStart.diff(windowStart)) / totalMs) * 100;
                        const width = ((segEnd.diff(segStart)) / totalMs) * 100;
                        const isActive = activeSegment === seg;
                        
                        let playedPercentage = 0;
                        if (isActive && playbackCursor) {
                            const cursorTime = dayjs(playbackCursor);
                            if (cursorTime.isAfter(segStart) && cursorTime.isBefore(segEnd)) {
                                playedPercentage = (cursorTime.diff(segStart) / segEnd.diff(segStart)) * 100;
                            } else if (cursorTime.isAfter(segEnd) || cursorTime.isSame(segEnd)) {
                                playedPercentage = 100;
                            }
                        }

                        return (
                            <Tooltip
                                key={i}
                                title={`${segStart.format('HH:mm')} – ${segEnd.format('HH:mm')} (${Math.round(seg.duration / 60)}m)`}
                                placement="top"
                            >
                                <div
                                    className={`pb-segment ${isActive ? 'active' : ''}`}
                                    style={{ left: `${Math.max(0, Math.min(100, left))}%`, width: `${Math.max(0.5, Math.min(100 - left, width))}%` }}
                                >
                                    {isActive && playedPercentage > 0 && (
                                        <div className="pb-segment-played" style={{ width: `${playedPercentage}%` }} />
                                    )}
                                </div>
                            </Tooltip>
                        );
                    })}

                    {/* Hour tick marks */}
                    {Array.from({ length: windowHours + 1 }, (_, i) => (
                        <div
                            key={i}
                            className="pb-tick"
                            style={{ left: `${(i / windowHours) * 100}%` }}
                        >
                            <span className="pb-tick-label">
                                {windowStart.add(i, 'hour').format('HH:mm')}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const noRecordingsFound = hasSearched && segments.length === 0;

    return (
        <Modal
            open={open}
            onCancel={onClose}
            title={
                <div className="pb-modal-title">
                    <VideoCameraOutlined style={{ color: '#1890ff' }} />
                    <span>Playback</span>
                    {camera && <span className="pb-camera-name">{camera.name}</span>}
                </div>
            }
            footer={null}
            width="90vw"
            centered
            className="playback-modal"
            destroyOnClose
            zIndex={10010}
        >
            <div className="pb-layout">
                {/* ── Left: Controls ─────────────────────────────── */}
                <div className="pb-controls-panel">
                    <div className="pb-section-label">
                        <CalendarOutlined /> Date & Time
                    </div>

                    <div className="pb-control-group">
                        <label>Date</label>
                        <DatePicker
                            value={selectedDate}
                            onChange={(d) => d && setSelectedDate(d)}
                            disabledDate={(d) => d.isAfter(dayjs())}
                            allowClear={false}
                            style={{ width: '100%' }}
                            getPopupContainer={(t) => t.parentElement || document.body}
                        />
                    </div>

                    <div className="pb-control-group">
                        <label>Start Hour</label>
                        <Select
                            value={startHour}
                            onChange={setStartHour}
                            style={{ width: '100%' }}
                            options={Array.from({ length: 24 }, (_, h) => ({
                                value: h,
                                label: `${String(h).padStart(2, '0')}:00`
                            }))}
                            getPopupContainer={(t) => t.parentElement || document.body}
                        />
                    </div>

                    <div className="pb-control-group">
                        <label>Window</label>
                        <Select
                            value={windowHours}
                            onChange={(v) => setWindowHours(v as DurationOption)}
                            style={{ width: '100%' }}
                            options={DURATION_OPTIONS}
                            getPopupContainer={(t) => t.parentElement || document.body}
                        />
                    </div>

                    <Button
                        type="primary"
                        icon={<SearchOutlined />}
                        loading={isSearching}
                        onClick={handleSearch}
                        block
                        className="pb-search-btn"
                        id="pb-search-recordings-btn"
                    >
                        {isSearching ? 'Searching...' : 'Search Recordings'}
                    </Button>

                    {/* Clip recording controls */}
                    {activeSegment && playbackUrl && (
                        <>
                            <div className="pb-divider" />
                            <div className="pb-section-label">
                                <ClockCircleOutlined /> Record Clip
                            </div>

                            <div className="pb-control-group">
                                <label>Clip Duration</label>
                                <Select
                                    value={clipDuration}
                                    onChange={setClipDuration}
                                    style={{ width: '100%' }}
                                    options={CLIP_OPTIONS}
                                    disabled={isRecordingClip}
                                    getPopupContainer={(t) => t.parentElement || document.body}
                                />
                            </div>

                            {!isRecordingClip ? (
                                <Button
                                    icon={<PlayCircleOutlined />}
                                    onClick={handleStartClipRecording}
                                    block
                                    className="pb-clip-btn"
                                    id="pb-record-clip-btn"
                                >
                                    Record {clipDuration}s Clip
                                </Button>
                            ) : (
                                <Button
                                    danger
                                    icon={<StopOutlined />}
                                    onClick={handleStopClip}
                                    block
                                    className="pb-clip-stop-btn recording"
                                    id="pb-stop-clip-btn"
                                >
                                    Stop ({clipCountdown}s left)
                                </Button>
                            )}

                            {/* Direct download if URL is a static file */}
                            {activeSegment?.url && (
                                <a href={activeSegment.url} download target="_blank" rel="noreferrer">
                                    <Button icon={<DownloadOutlined />} block className="pb-download-btn" id="pb-download-btn">
                                        Download Recording
                                    </Button>
                                </a>
                            )}
                        </>
                    )}
                </div>

                {/* ── Right: Timeline + Player ─────────────────────── */}
                <div className="pb-player-panel">
                    {/* Timeline */}
                    <div className="pb-timeline-section">
                        <div className="pb-section-label">
                            <ClockCircleOutlined />
                            Timeline: {windowStart.format('HH:mm')} – {windowEnd.format('HH:mm')}
                            {hasSearched && (
                                <span className="pb-segment-count">
                                    {segments.length} segment{segments.length !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>

                        {!hasSearched && !isSearching && (
                            <div className="pb-empty-state">
                                <SearchOutlined style={{ fontSize: 32, opacity: 0.3 }} />
                                <p>Select a date & time range, then click <strong>Search Recordings</strong></p>
                            </div>
                        )}

                        {isSearching && (
                            <div className="pb-empty-state">
                                <Spin tip="Searching recordings..." />
                            </div>
                        )}

                        {hasSearched && !isSearching && (
                            <>
                                {noRecordingsFound ? (
                                    <div className="pb-empty-state warning">
                                        <WarningOutlined style={{ fontSize: 28, color: '#faad14' }} />
                                        <p>No recordings found for this time window.</p>
                                        <p className="pb-hint">
                                            Ensure the NVR has recording enabled and the backend supports the recordings API.
                                        </p>
                                    </div>
                                ) : (
                                    renderTimeline()
                                )}
                            </>
                        )}
                    </div>

                    {/* Video Player */}
                    <div className="pb-video-section">
                        {!activeSegment && (
                            <div className="pb-video-placeholder">
                                <VideoCameraOutlined style={{ fontSize: 48, opacity: 0.2 }} />
                                <p>Select a recording segment from the timeline to begin playback</p>
                            </div>
                        )}

                        {activeSegment && (
                            <div className="pb-video-wrapper">
                                {/* Segment info bar */}
                                <div className="pb-segment-info">
                                    <span>
                                        📅 {dayjs(activeSegment.startTime).format('DD MMM YYYY')}
                                        &nbsp;·&nbsp;
                                        ⏰ {dayjs(activeSegment.startTime).format('HH:mm:ss')} → {dayjs(activeSegment.endTime).format('HH:mm:ss')}
                                        &nbsp;·&nbsp;
                                        ⏱ {Math.round(activeSegment.duration / 60)}m {activeSegment.duration % 60}s
                                    </span>
                                    {isRecordingClip && (
                                        <span className="pb-clip-indicator">
                                            <span className="pb-clip-dot" />
                                            RECORDING CLIP — {clipCountdown}s left
                                        </span>
                                    )}
                                </div>

                                {/* Video element */}
                                <div className="pb-video-container">
                                    {(isBuffering || (!playbackUrl && !streamInfo && !videoError)) && (
                                        <div className="pb-buffering-overlay">
                                            <Spin size="large" tip="Buffering..." />
                                        </div>
                                    )}

                                    {videoError ? (
                                        <div className="pb-error-overlay">
                                            <WarningOutlined style={{ fontSize: 36, color: '#ff4d4f' }} />
                                            <p>{videoError}</p>
                                            <Button onClick={() => { setVideoError(null); setPlaybackUrl(null); setStreamInfo(null); setActiveSegment(null); }}>
                                                Dismiss
                                            </Button>
                                        </div>
                                    ) : streamInfo && streamInfo.webRtcUrl ? (
                                        <WebRtcPlayer
                                            streamUrl={streamInfo.webRtcUrl}
                                            iceServers={streamInfo.iceServers}
                                            autoPlay
                                            muted={false}
                                            videoRef={videoRef}
                                            onPlay={handleVideoPlay}
                                            onPause={handleVideoPause}
                                            onTimeUpdate={handleTimeUpdate}
                                            onDurationChange={handleDurationChange}
                                            onCanPlay={handleVideoCanPlay}
                                            onWaiting={handleVideoWaiting}
                                            onStatusChange={(status) => {
                                                if (status === 'failed') handleVideoError();
                                                if (status === 'loading') setIsBuffering(true);
                                                if (status === 'online') setIsBuffering(false);
                                            }}
                                        />
                                    ) : playbackUrl ? (
                                        <video
                                            ref={videoRef}
                                            className="pb-video"
                                            controls={false}
                                            playsInline
                                            preload="metadata"
                                            onPlay={handleVideoPlay}
                                            onPause={handleVideoPause}
                                            onTimeUpdate={handleTimeUpdate}
                                            onDurationChange={handleDurationChange}
                                            onCanPlay={handleVideoCanPlay}
                                            onWaiting={handleVideoWaiting}
                                            onError={handleVideoError}
                                        />
                                    ) : null}
                                </div>

                                {/* Custom controls (only for direct URLs, WebRTC is live) */}
                                {!videoError && playbackUrl && (
                                    <div className="pb-custom-controls">
                                        <Button
                                            type="text"
                                            icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                                            onClick={handlePlayPause}
                                            className="pb-play-btn"
                                            id="pb-play-pause-btn"
                                        />
                                        <span className="pb-time-display">
                                            {formatTime(currentTime)} / {formatTime(videoDuration)}
                                        </span>
                                        <div className="pb-seek-wrapper">
                                            <Slider
                                                min={0}
                                                max={videoDuration || 1}
                                                step={0.5}
                                                value={currentTime}
                                                onChange={handleSeek}
                                                tooltip={{ formatter: (v) => formatTime(v ?? 0) }}
                                                className="pb-seek-slider"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default PlaybackModal;
