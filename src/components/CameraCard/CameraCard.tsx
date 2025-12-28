import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Camera } from '../../types';
import { logger } from '../../utils/logger';

interface CameraCardProps {
    camera: Camera;
    onClick: (camera: Camera) => void;
    index?: number; // For staggered loading
}

const CameraCard: React.FC<CameraCardProps> = ({ camera, onClick, index = 0 }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        if (!camera.streamUrl || !videoRef.current) {
            setIsLoading(false);
            return;
        }

        const video = videoRef.current;
        const streamUrl = `http://localhost:8080${camera.streamUrl}`;

        // Stagger initialization to avoid overwhelming backend
        const initDelay = index * 300; // 300ms delay between each camera

        const timeoutId = setTimeout(() => {
            if (Hls.isSupported()) {
                // Clean up previous HLS instance if exists
                if (hlsRef.current) {
                    hlsRef.current.destroy();
                }

                const hls = new Hls({
                    enableWorker: true,
                    lowLatencyMode: true,
                    backBufferLength: 90,
                    maxBufferLength: 30,
                    maxMaxBufferLength: 60,
                    manifestLoadingTimeOut: 20000,
                    manifestLoadingMaxRetry: 3,
                    manifestLoadingRetryDelay: 1000,
                    levelLoadingTimeOut: 20000,
                    levelLoadingMaxRetry: 3,
                    fragLoadingTimeOut: 20000,
                    fragLoadingMaxRetry: 3,
                });

                hlsRef.current = hls;
                hls.loadSource(streamUrl);
                hls.attachMedia(video);

                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    setIsLoading(false);
                    setHasError(false);
                    video.play().catch((err) => {
                        logger.warn(`Autoplay failed for ${camera.name}:`, err);
                    });
                });

                hls.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        logger.error(`HLS Error for ${camera.name}:`, data);
                        setHasError(true);
                        setIsLoading(false);

                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                logger.info(`Network error for ${camera.name}, attempting recovery...`);
                                hls.startLoad();
                                break;
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                logger.info(`Media error for ${camera.name}, attempting recovery...`);
                                hls.recoverMediaError();
                                break;
                            default:
                                logger.error(`Unrecoverable error for ${camera.name}`);
                                break;
                        }
                    }
                });

                hls.on(Hls.Events.FRAG_LOADED, () => {
                    if (hasError) {
                        setHasError(false);
                    }
                });

            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                // Native HLS support (Safari)
                video.src = streamUrl;
                video.addEventListener('loadedmetadata', () => {
                    setIsLoading(false);
                    setHasError(false);
                });
                video.addEventListener('error', () => {
                    setHasError(true);
                    setIsLoading(false);
                });
                video.play().catch(() => { });
            }
        }, initDelay);

        // Cleanup on unmount
        return () => {
            clearTimeout(timeoutId);
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
        };
    }, [camera.streamUrl, camera.name, index, hasError]);

    return (
        <div className="camera-card" onClick={() => onClick(camera)}>
            {camera.streamUrl ? (
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <video
                        ref={videoRef}
                        muted
                        autoPlay
                        playsInline
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
                            fontSize: '14px',
                            textAlign: 'center'
                        }}>
                            Loading...
                        </div>
                    )}
                    {hasError && (
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            background: '#000',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ff4d4f',
                            fontSize: '12px',
                            textAlign: 'center',
                            padding: '10px'
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
                    <div className="dot"></div>
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
