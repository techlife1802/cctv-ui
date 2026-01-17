import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Camera } from '../../types';
import { logger } from '../../utils/logger';
import { BASE_URL } from '../../api/client';
import { cameraService, streamService } from '../../services/apiService';
import WebRtcPlayer from '../WebRtcPlayer';

interface CameraCardProps {
    camera: Camera;
    onClick: (camera: Camera, stream?: MediaStream) => void;
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

    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [streamInfo, setStreamInfo] = useState<any | null>(null);
    const [useWebRtc, setUseWebRtc] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const [streamStatus, setStreamStatus] = useState<'loading' | 'online' | 'retrying' | 'failed' | string>(camera.status);

    const handleStatusChange = React.useCallback((status: 'loading' | 'online' | 'retrying' | 'failed') => {
        setStreamStatus(status);
    }, []);

    const handleWebRtcError = React.useCallback((err: Error) => {
        logger.warn('WebRTC failed, retrying...', err);
        if (retryCount < 3) {
            setTimeout(() => setRetryCount(prev => prev + 1), 2000);
        } else {
            setUseWebRtc(false);
        }
    }, [retryCount]);

    const handleStreamReady = (stream: MediaStream) => {
        activeStreamRef.current = stream;
        if (onStreamReady) {
            onStreamReady(camera, stream);
        }
    };

    const handleCardClick = () => {
        onClick(camera, activeStreamRef.current || undefined);
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
    }, [camera.streamUrl]);

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
            if (camera.streamUrl.includes('.m3u8') || camera.streamUrl.includes('/stream/')) {
                streamUrl = `${BASE_URL}${camera.streamUrl}`;
                isHls = true;
            } else {
                streamUrl = `${BASE_URL}${camera.streamUrl}`;
            }
        }

        if (!streamUrl) {
            logger.error(`No valid stream URL for camera ${camera.name}`);
            setIsLoading(false);
            setHasError(true);
            return;
        }

        const initDelay = (index + 1) * 300;

        const timeoutId = setTimeout(() => {
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
                    liveSyncDuration: 1,
                    liveMaxLatencyDuration: 2,
                    maxLiveSyncPlaybackRate: 1.5,
                    maxBufferLength: 3,
                    maxMaxBufferLength: 5,
                    backBufferLength: 0,
                    manifestLoadingMaxRetry: 10,
                    levelLoadingMaxRetry: 10,
                    fragLoadingMaxRetry: 10,
                    manifestLoadingRetryDelay: 2000,
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
    }, [camera.streamUrl, index, streamInfo, useWebRtc]);

    const shouldUseWebRtc = streamInfo?.mediamtxEnabled && useWebRtc && streamInfo.webRtcUrl;

    return (
        <div className="camera-card" onClick={handleCardClick}>
            {camera.streamUrl ? (
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    {shouldUseWebRtc ? (
                        <WebRtcPlayer
                            streamUrl={streamInfo!.webRtcUrl!}
                            autoPlay
                            muted
                            onStreamReady={handleStreamReady}
                            onStatusChange={handleStatusChange}
                            onError={handleWebRtcError}
                        />
                    ) : (
                        <video
                            ref={videoRef}
                            muted
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
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ff4d4f',
                            fontSize: '12px'
                        }}>
                            Stream unavailable
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
                <div className="camera-info">
                    <h4>{camera.name}</h4>
                    <p>{camera.location}</p>
                </div>
            </div>
        </div>
    );
};

export default React.memo(CameraCard);
