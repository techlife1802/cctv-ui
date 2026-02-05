import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Camera } from '../../types';
import { logger } from '../../utils/logger';
import { BASE_URL } from '../../api/client';
import { streamService } from '../../services/apiService';
import WebRtcPlayer from '../WebRtcPlayer';
import { AudioOutlined, AudioMutedOutlined, ReloadOutlined } from '@ant-design/icons';

interface CameraCardProps {
    camera: Camera;
    onClick: (camera: Camera, stream?: MediaStream, startTalking?: boolean) => void;
    onStreamReady?: (camera: Camera, stream: MediaStream) => void;
    index?: number;
    isModalCard?: boolean;
    useSubstream?: boolean;
}

// Global request queue for stream info to prevent network congestion
// Max 4 concurrent requests for stream info
const streamInfoQueue: {
    queue: (() => Promise<void>)[];
    running: number;
    maxConcurrent: number;
} = {
    queue: [],
    running: 0,
    maxConcurrent: 4
};

const processQueue = async () => {
    if (streamInfoQueue.running >= streamInfoQueue.maxConcurrent || streamInfoQueue.queue.length === 0) {
        return;
    }

    streamInfoQueue.running++;
    const task = streamInfoQueue.queue.shift();
    if (task) {
        try {
            await task();
        } finally {
            streamInfoQueue.running--;
            processQueue();
        }
    }
};

const CameraCard: React.FC<CameraCardProps> = ({
    camera,
    onClick,
    onStreamReady,
    index = 0,
    isModalCard = false,
    useSubstream = false
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
        if (!camera.streamUrl) return;

        let isMounted = true;

        const fetchStreamInfo = async () => {
            const getInfoTask = async () => {
                if (!isMounted) return;
                try {
                    setIsLoading(true);
                    setHasError(false);
                    const info = await streamService.getStreamInfo(camera.nvrId, camera.channelId, useSubstream);
                    if (isMounted) {
                        setStreamInfo(info);
                        if (info.webRtcUrl && window.RTCPeerConnection) {
                            setUseWebRtc(true);
                            setHasError(false); // Reset error if we have new info
                        }
                    }
                } catch (err) {
                    if (isMounted) {
                        logger.error(`Error fetching stream info for camera ${camera.name}:`, err);
                        setHasError(true);
                        setIsLoading(false);
                    }
                }
            };

            // Add to static queue
            streamInfoQueue.queue.push(getInfoTask);
            processQueue();
        };

        // If it's a direct RTSP/HTTP URL, we don't need info proxy
        if (!camera.streamUrl.includes('/info')) {
            setIsLoading(false);
            return;
        }

        // Staggered loading: increasing delay based on index
        // High-density views get more delay to smooth out traffic
        const baseDelay = useSubstream ? 400 : 200;
        const initDelay = index * baseDelay;

        const timeout = setTimeout(fetchStreamInfo, initDelay);

        return () => {
            isMounted = false;
            clearTimeout(timeout);
            // Remove from queue if still there (optimization)
            streamInfoQueue.queue = streamInfoQueue.queue.filter(t => t !== fetchStreamInfo);
        };
    }, [camera.streamUrl, index, refreshKey, useSubstream, camera.nvrId, camera.channelId, camera.name]);

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
            // Don't set error if we are still waiting for info fetch
            if (camera.streamUrl.includes('/info') && !streamInfo) {
                return;
            }
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

    // Auto-reconnect on error
    useEffect(() => {
        if (hasError && !isLoading) {
            // 2s base delay + random jitter between 0 and 3 seconds
            const randomJitter = Math.floor(Math.random() * 3000);
            const delay = 2000 + randomJitter;

            const timer = setTimeout(() => {
                logger.info(`Auto-reconnecting ${camera.name} after ${delay}ms...`);
                handleRefresh({ stopPropagation: () => { } } as React.MouseEvent);
            }, delay);
            return () => clearTimeout(timer);
        }
    }, [hasError, isLoading, camera.name]);

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

                    {(isLoading || (camera.streamUrl.includes('/info') && !streamInfo && !hasError)) && !hasError && (
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            color: '#fff',
                            fontSize: '14px',
                            zIndex: 5
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
                            <div>Stream Unavailable</div>
                            <button
                                onClick={handleRefresh}
                                className="refresh-button"
                                style={{
                                    background: '#1890ff',
                                    border: 'none',
                                    color: '#fff',
                                    padding: '8px',
                                    borderRadius: '50%',
                                    cursor: 'pointer',
                                    width: '32px',
                                    height: '32px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s ease',
                                    zIndex: 11
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = '#40a9ff';
                                    e.currentTarget.style.transform = 'scale(1.1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = '#1890ff';
                                    e.currentTarget.style.transform = 'scale(1)';
                                }}
                            >
                                <ReloadOutlined spin={isLoading} />
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <img src={camera.thumbnail} alt={camera.name} loading="lazy" />
            )}

            <div className="camera-overlay">
                {streamStatus.toLowerCase() === 'online' ? (
                    <div className="status-badge online" style={{
                        background: 'transparent',
                        border: 'none',
                        padding: '4px',
                        backdropFilter: 'none'
                    }}>
                        <div className="dot" style={{ boxShadow: '0 0 8px #52c41a' }} />
                    </div>
                ) : (
                    <div className={`status-badge ${streamStatus.toLowerCase()}`}>
                        <div className="dot" />
                        {streamStatus}
                    </div>
                )}
                {/* <div className="camera-info">
                    <h4>{camera.name}</h4>
                    <p>{camera.location}</p>
                </div> */}
                {/* <div className="audio-toggle" onClick={toggleAudio}>
                    {isMuted ? (
                        <AudioMutedOutlined title="Unmute" />
                    ) : (
                        <AudioOutlined title="Mute" style={{ color: '#1890ff' }} />
                    )}
                </div> */}
            </div>
        </div>
    );
};

export default React.memo(CameraCard);
