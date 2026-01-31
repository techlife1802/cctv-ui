import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Camera } from '../../types';
import { logger } from '../../utils/logger';
import { BASE_URL } from '../../api/client';
import { streamService } from '../../services/apiService';
import WebRtcPlayer from '../WebRtcPlayer';
import { AudioOutlined, AudioMutedOutlined, InteractionOutlined, ReloadOutlined } from '@ant-design/icons';

interface CameraCardProps {
    camera: Camera;
    onClick: (camera: Camera, stream?: MediaStream, startTalking?: boolean) => void;
    onStreamReady?: (camera: Camera, stream: MediaStream) => void;
    index?: number;
}

const CameraCard: React.FC<CameraCardProps> = ({
    camera,
    onClick,
    onStreamReady,
    index = 0
}) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const hlsRef = useRef<Hls | null>(null);
    const activeStreamRef = useRef<MediaStream | null>(null);

    const initialLoadDoneRef = useRef(false);

    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [streamInfo, setStreamInfo] = useState<any | null>(null);
    const [useWebRtc, setUseWebRtc] = useState(false);
    const [streamStatus, setStreamStatus] = useState<'loading' | 'online' | 'retrying' | 'failed' | string>(camera.status);
    const [isMuted, setIsMuted] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    const handleStatusChange = React.useCallback((status: 'loading' | 'online' | 'retrying' | 'failed') => {
        setStreamStatus(status);
    }, []);

    const handleWebRtcError = React.useCallback((err: Error) => {
        logger.warn('WebRTC failed, switching to HLS fallback immediately...', err);
        setUseWebRtc(false);
    }, []);

    const toggleAudio = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMuted((prev: boolean) => !prev);
    };

    const handleStreamReady = (stream: MediaStream) => {
        activeStreamRef.current = stream;
        if (onStreamReady) {
            onStreamReady(camera, stream);
        }
    };

    const handleCardClick = () => {
        onClick(camera, activeStreamRef.current || undefined);
    };

    const handleTalkClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onClick(camera, activeStreamRef.current || undefined, true);
    };

    const handleRefresh = (e: React.MouseEvent) => {
        e.stopPropagation();
        logger.info(`Refreshing stream for ${camera.name}`);

        // Clean up existing stream
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }

        // Reset states
        setHasError(false);
        setIsLoading(true);
        setStreamStatus('loading');
        setUseWebRtc(false);
        setStreamInfo(null);

        // Trigger re-fetch by incrementing refresh key
        setRefreshKey(prev => prev + 1);
    };

    // Fetch MediaMTX stream info if needed
    useEffect(() => {
        if (!camera.streamUrl) {
            setIsLoading(false);
            return;
        }

        if (camera.streamUrl.includes('/info')) {
            const match = camera.streamUrl.match(/\/stream\/([^/]+)\/(\d+)\/info/);
            if (match) {
                const [, nvrId, channelIdStr] = match;
                const channelId = parseInt(channelIdStr, 10);
                streamService.getStreamInfo(nvrId, channelId)
                    .then(info => {
                        setStreamInfo(info);
                        if (info.webRtcUrl && window.RTCPeerConnection) {
                            setUseWebRtc(true);
                            setHasError(false); // Reset error if we have new info
                        }
                    })
                    .catch(err => {
                        logger.error('Failed to fetch stream info', err);
                        setStreamInfo(null);
                    });
            }
        }
    }, [camera.streamUrl, refreshKey]);

    // Play stream (HLS or fallback)
    useEffect(() => {
        if (!camera.streamUrl || !videoRef.current) {
            setIsLoading(false);
            return;
        }

        const video = videoRef.current;
        let streamUrl: string | undefined;
        let isHls = false;

        if (streamInfo?.mediamtxEnabled) {
            if (useWebRtc && streamInfo.webRtcUrl) {
                setIsLoading(false);
                return;
            } else if (streamInfo.hlsUrl) {
                streamUrl = streamInfo.hlsUrl;
                isHls = true;
            } else {
                streamUrl = streamInfo.rtspUrl;
            }
        } else {
            // Fallback logic: Only use the URL directly if it's NOT an info URL
            if (!camera.streamUrl.includes('/info')) {
                if (camera.streamUrl.includes('.m3u8') || camera.streamUrl.includes('/stream/')) {
                    streamUrl = `${BASE_URL}${camera.streamUrl}`;
                    isHls = true;
                } else {
                    streamUrl = `${BASE_URL}${camera.streamUrl}`;
                }
            } else {
                // It is an info URL but streamInfo is not enabled/ready?
                // Actually if it IS an info URL, we must wait for streamInfo.
                // If streamInfo failed, we might have an issue, but we can't play the info URL.
            }
        }

        if (!streamUrl) {
            logger.error(`No valid stream URL for camera ${camera.name}`);
            setIsLoading(false);
            setHasError(true);
            return;
        }

        // Only stagger the INITIAL load. Subsequent fallbacks should be instant.
        const initDelay = initialLoadDoneRef.current ? 0 : (index + 1) * 200;

        const timeoutId = setTimeout(() => {
            initialLoadDoneRef.current = true;
            if (!isHls) {
                setIsLoading(false);
                return;
            }

            // ✅ TypeScript-safe: ensure streamUrl is defined
            if (!streamUrl) {
                setIsLoading(false);
                setHasError(true);
                return;
            }

            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }

            setHasError(false); // Reset error before starting HLS load

            if (Hls.isSupported()) {
                const hls = new Hls({
                    liveSyncDuration: 0.5,
                    liveMaxLatencyDuration: 1.5,
                    maxLiveSyncPlaybackRate: 2,
                    maxBufferLength: 2,
                    maxMaxBufferLength: 4,
                    backBufferLength: 0,
                    manifestLoadingMaxRetry: 20,
                    levelLoadingMaxRetry: 20,
                    fragLoadingMaxRetry: 20,
                    manifestLoadingRetryDelay: 500,
                    enableWorker: true
                });

                hlsRef.current = hls;

                // TypeScript now knows streamUrl is string (not undefined)
                hls.loadSource(streamUrl);
                hls.attachMedia(video);

                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    setIsLoading(false);
                    setHasError(false);
                    setStreamStatus('online');

                    const liveEdge = hls.liveSyncPosition;
                    if (liveEdge !== null && !isNaN(liveEdge)) {
                        video.currentTime = liveEdge;
                    }

                    video.play().catch(err => {
                        logger.warn(`Autoplay failed for ${camera.name}`, err);
                    });
                });

                hls.on(Hls.Events.ERROR, (_, data) => {
                    if (!data.fatal) return;

                    logger.error(`HLS error for ${camera.name}`, data);
                    setHasError(true);
                    setIsLoading(false);
                    setStreamStatus('failed');

                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        hls.startLoad();
                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        hls.recoverMediaError();
                    } else {
                        hls.destroy();
                    }
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                // TypeScript knows streamUrl is string (not undefined)
                video.src = streamUrl;
                video.play().catch(() => { });
                setIsLoading(false);
            } else {
                setHasError(true);
                setIsLoading(false);
            }

        }, initDelay);

        return () => {
            clearTimeout(timeoutId);
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
        };
    }, [camera.streamUrl, index, streamInfo, useWebRtc, refreshKey]);

    // Handle explicit unmuting
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.muted = isMuted;
            if (!isMuted) {
                videoRef.current.play().catch(() => { });
            }
        }
    }, [isMuted]);

    const shouldUseWebRtc = streamInfo?.mediamtxEnabled && useWebRtc && streamInfo.webRtcUrl;

    return (
        <div className="camera-card" onClick={handleCardClick}>
            {camera.streamUrl ? (
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    {shouldUseWebRtc ? (
                        <WebRtcPlayer
                            streamUrl={streamInfo!.webRtcUrl!}
                            autoPlay
                            muted={isMuted}
                            onStreamReady={handleStreamReady}
                            onStatusChange={handleStatusChange}
                            onError={handleWebRtcError}
                        />
                    ) : (
                        <video
                            ref={videoRef}
                            muted={isMuted}
                            autoPlay
                            playsInline
                            preload="metadata"
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                                background: '#000',
                                display: hasError ? 'none' : 'block'
                            }}
                        />
                    )}

                    {isLoading && !hasError && (
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            color: '#fff',
                            fontSize: '14px'
                        }}>Loading...</div>
                    )}

                    {hasError && (
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: '#000',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '12px',
                            color: '#ff4d4f',
                            fontSize: '12px',
                            zIndex: 10
                        }}>
                            <div>Stream unavailable</div>
                            <button
                                onClick={handleRefresh}
                                className="refresh-button"
                                style={{
                                    background: '#1890ff',
                                    border: 'none',
                                    color: '#fff',
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.2s ease',
                                    zIndex: 11
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = '#40a9ff';
                                    e.currentTarget.style.transform = 'scale(1.05)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = '#1890ff';
                                    e.currentTarget.style.transform = 'scale(1)';
                                }}
                            >
                                <ReloadOutlined spin={isLoading} />
                                Reconnect
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <img src={camera.thumbnail} alt={camera.name} loading="lazy" />
            )}

            <div className="camera-overlay">
                <div className={`status-badge ${streamStatus.toLowerCase()}`}>
                    <div className="dot" />
                    {streamStatus}
                </div>
                {/* <div className="camera-info">
                    <h4>{camera.name}</h4>
                    <p>{camera.location}</p>
                </div> */}
                <div className="audio-toggle" onClick={toggleAudio}>
                    {isMuted ? (
                        <AudioMutedOutlined title="Unmute" />
                    ) : (
                        <AudioOutlined title="Mute" style={{ color: '#1890ff' }} />
                    )}
                </div>
                {/* <div className="talk-toggle" onClick={handleTalkClick} style={{
                    cursor: 'pointer',
                    padding: '4px',
                    borderRadius: '4px',
                    background: 'rgba(0, 0, 0, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px'
                }}>
                    <InteractionOutlined title="Speak to Camera" />
                </div> */}
            </div>
        </div>
    );
};

export default React.memo(CameraCard);
