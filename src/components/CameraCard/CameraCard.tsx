import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Camera } from '../../types';
import { logger } from '../../utils/logger';
import { BASE_URL } from '../../api/client';

interface CameraCardProps {
    camera: Camera;
    onClick: (camera: Camera) => void;
    index?: number;
}

const CameraCard: React.FC<CameraCardProps> = ({ camera, onClick, index = 0 }) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const hlsRef = useRef<Hls | null>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        if (!camera.streamUrl || !videoRef.current) {
            setIsLoading(false);
            return;
        }

        const video = videoRef.current;
        const streamUrl = `${BASE_URL}${camera.streamUrl}`;
        const initDelay = index * 200;

        const timeoutId = setTimeout(() => {
            // Cleanup any previous instance
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }

            if (Hls.isSupported()) {
                const hls = new Hls({
                    // LIVE LOW-LATENCY SETTINGS
                    liveSyncDuration: 1,
                    liveMaxLatencyDuration: 2,
                    maxLiveSyncPlaybackRate: 1.5,

                    // BUFFER CONTROL (CRITICAL)
                    maxBufferLength: 3,
                    maxMaxBufferLength: 5,
                    backBufferLength: 0,

                    // FAST FAILURE RECOVERY
                    manifestLoadingMaxRetry: 2,
                    levelLoadingMaxRetry: 2,
                    fragLoadingMaxRetry: 2,

                    enableWorker: true
                });

                hlsRef.current = hls;

                hls.loadSource(streamUrl);
                hls.attachMedia(video);

                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    setIsLoading(false);
                    setHasError(false);

                    // FORCE JUMP TO LIVE EDGE
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

                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        hls.startLoad();
                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        hls.recoverMediaError();
                    } else {
                        hls.destroy();
                    }
                });

                // Auto-resync if player stalls
                hls.on(Hls.Events.ERROR, (_, data) => {
                    if (!data.fatal) return;

                    if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        hls.recoverMediaError();
                    } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        hls.startLoad();
                    }
                });

            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                // Safari native HLS
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
    }, [camera.streamUrl, index]);

    return (
        <div className="camera-card" onClick={() => onClick(camera)}>
            {camera.streamUrl ? (
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <video
                        ref={videoRef}
                        muted
                        autoPlay
                        playsInline
                        preload="metadata"
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            background: '#000',
                            display: hasError ? 'none' : 'block'
                        }}
                    />

                    {isLoading && (
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            color: '#fff',
                            fontSize: '14px'
                        }}>
                            Loading...
                        </div>
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
                <div className={`status-badge ${camera.status}`}>
                    <div className="dot" />
                    {camera.status}
                </div>
                <div className="camera-info">
                    <h4>{camera.name}</h4>
                    <p>{camera.location}</p>
                </div>
            </div>
        </div>
    );
};

export default CameraCard;
