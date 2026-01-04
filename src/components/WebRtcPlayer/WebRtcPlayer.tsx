import React, { useRef, useEffect, useState } from 'react';
import { logger } from '../../utils/logger';

interface WebRtcPlayerProps {
    streamUrl: string;
    autoPlay?: boolean;
    muted?: boolean;
    onStreamReady?: (stream: MediaStream) => void;
    initialStream?: MediaStream | null;
    onError?: (error: Error) => void;
    iceServers?: { urls: string | string[]; username?: string; credential?: string }[];
    onStatusChange?: (status: 'loading' | 'online' | 'retrying' | 'failed') => void;
}

/**
 * WebRTC Player Component for MediaMTX
 * Implements the WHEP-like SDP exchange required by MediaMTX WebRTC
 */
const WebRtcPlayer: React.FC<WebRtcPlayerProps> = ({
    streamUrl,
    autoPlay = true,
    muted = true,
    onStreamReady,
    initialStream,
    onError,
    iceServers,
    onStatusChange
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isLoading, setIsLoading] = useState(!initialStream);
    const [hasError, setHasError] = useState(false);
    const pcRef = useRef<RTCPeerConnection | null>(null);

    // Use refs for callbacks to avoid effect dependency issues
    const onStreamReadyRef = useRef(onStreamReady);
    const onErrorRef = useRef(onError);
    const onStatusChangeRef = useRef(onStatusChange);

    useEffect(() => {
        onStreamReadyRef.current = onStreamReady;
        onErrorRef.current = onError;
        onStatusChangeRef.current = onStatusChange;
    });

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        // If we have an initial stream, just use it and skip handshake
        if (initialStream) {
            video.srcObject = initialStream;
            setIsLoading(false);
            setHasError(false);
            if (onStatusChangeRef.current) onStatusChangeRef.current('online');
            return;
        }

        if (!streamUrl) {
            setIsLoading(false);
            return;
        }

        const startWebRtc = async () => {
            try {
                if (onStatusChangeRef.current) onStatusChangeRef.current('loading');
                setIsLoading(true);
                setHasError(false);

                // 1. Create peer connection
                const pc = new RTCPeerConnection({
                    iceServers: iceServers && iceServers.length > 0
                        ? iceServers
                        : [{ urls: 'stun:stun.l.google.com:19302' }]
                });
                pcRef.current = pc;

                // 2. Monitor ICE state
                pc.oniceconnectionstatechange = () => {
                    logger.info(`ICE Connection State for ${streamUrl}: ${pc.iceConnectionState}`);
                    if (pc.iceConnectionState === 'failed') {
                        setHasError(true);
                        setIsLoading(false);
                        if (onStatusChangeRef.current) onStatusChangeRef.current('failed');
                        if (onErrorRef.current) onErrorRef.current(new Error('WebRTC ICE Connection Failed'));
                    } else if (pc.iceConnectionState === 'disconnected') {
                        if (onStatusChangeRef.current) onStatusChangeRef.current('retrying');
                    } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                        if (onStatusChangeRef.current) onStatusChangeRef.current('online');
                    }
                };

                // 3. Setup track handling
                pc.ontrack = (event) => {
                    const stream = event.streams[0];
                    if (video) {
                        video.srcObject = stream;
                    }
                    if (onStreamReadyRef.current) {
                        onStreamReadyRef.current(stream);
                    }
                    if (onStatusChangeRef.current) onStatusChangeRef.current('online');
                };

                // 4. Add transceivers for video and audio (recvonly)
                pc.addTransceiver('video', { direction: 'recvonly' });
                pc.addTransceiver('audio', { direction: 'recvonly' });

                // 5. Create and set local description
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                // 6. Wait for ICE gathering to complete
                await new Promise<void>((resolve) => {
                    if (pc.iceGatheringState === 'complete') {
                        resolve();
                    } else {
                        const checkState = () => {
                            if (pc.iceGatheringState === 'complete') {
                                pc.removeEventListener('icegatheringstatechange', checkState);
                                resolve();
                            }
                        };
                        pc.addEventListener('icegatheringstatechange', checkState);
                        setTimeout(resolve, 500);
                    }
                });

                // 7. Exchange SDP with MediaMTX using WHEP/application/sdp
                const response = await fetch(streamUrl, {
                    method: 'POST',
                    body: pc.localDescription!.sdp,
                    headers: { 'Content-Type': 'application/sdp' }
                });
                if (!response.ok) {
                    throw new Error(`MediaMTX WebRTC signaled error: ${response.status}`);
                }

                const answerSdp = await response.text();

                // 8. Set remote description
                await pc.setRemoteDescription(new RTCSessionDescription({
                    type: 'answer',
                    sdp: answerSdp
                }));

                // 9. Success Timeout & Data Monitoring
                let lastByteCount = 0;
                let inactivityTicks = 0;
                const monitorInterval = setInterval(() => {
                    const stats = pc.getStats();
                    stats.then(report => {
                        report.forEach(stat => {
                            if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
                                if (stat.bytesReceived === lastByteCount) {
                                    inactivityTicks++;
                                } else {
                                    inactivityTicks = 0;
                                    lastByteCount = stat.bytesReceived;
                                }

                                if (inactivityTicks > 40) { // ~20 seconds of no data
                                    logger.warn('WebRTC data inactivity detected, failing over...');
                                    handleError(new Error('WebRTC Data Inactivity'));
                                    clearInterval(monitorInterval);
                                }
                            }
                        });
                    });
                }, 500);

                const playTimeout = setTimeout(() => {
                    if (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
                        logger.error('WebRTC play timeout - no connection established');
                        handleError(new Error('WebRTC Connection Timeout'));
                        clearInterval(monitorInterval);
                    }
                }, 30000);

                setIsLoading(false);
                return () => {
                    clearTimeout(playTimeout);
                    clearInterval(monitorInterval);
                };
            } catch (err) {
                handleError(err as Error);
            }
        };

        const handleError = (err: Error) => {
            logger.error('WebRTC failed', err);
            setHasError(true);
            setIsLoading(false);
            if (onStatusChange) onStatusChange('failed');
            if (onError) {
                onError(err);
            }
        };

        let cleanupFn: (() => void) | undefined;
        startWebRtc().then(cfn => { cleanupFn = cfn; });

        return () => {
            if (pcRef.current) {
                pcRef.current.close();
                pcRef.current = null;
            }
            if (video) {
                video.srcObject = null;
            }
            if (cleanupFn && typeof cleanupFn === 'function') {
                cleanupFn();
            }
        };
    }, [streamUrl, initialStream, iceServers]);

    useEffect(() => {
        const video = videoRef.current;
        if (video && autoPlay && !isLoading && !hasError) {
            video.play().catch(err => logger.warn('WebRTC play failed', err));
        }
    }, [autoPlay, isLoading, hasError]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000' }}>
            <video
                ref={videoRef}
                autoPlay={autoPlay}
                muted={muted}
                playsInline
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: hasError ? 'none' : 'block'
                }}
            />
            {isLoading && !hasError && (
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    color: '#fff',
                    textAlign: 'center'
                }}>
                    <div style={{ marginBottom: '8px' }}>🚀 Connecting ultra-low latency...</div>
                    <div style={{ fontSize: '12px', opacity: 0.7 }}>WebRTC Handshake</div>
                </div>
            )}
            {hasError && (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ff4d4f',
                    fontSize: '12px',
                    padding: '20px',
                    textAlign: 'center'
                }}>
                    WebRTC unavailable. Falling back to HLS...
                </div>
            )}
        </div>
    );
};

export default WebRtcPlayer;
