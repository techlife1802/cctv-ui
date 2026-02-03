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
    isTalking?: boolean;
    videoRef?: React.RefObject<HTMLVideoElement | null>;
}

const WebRtcPlayer: React.FC<WebRtcPlayerProps> = ({
    streamUrl,
    autoPlay = true,
    muted = true,
    onStreamReady,
    initialStream,
    onError,
    iceServers,
    onStatusChange,
    isTalking = false,
    videoRef: externalVideoRef
}) => {
    const internalVideoRef = useRef<HTMLVideoElement>(null);
    const videoRef = externalVideoRef || internalVideoRef;

    // ... rest of the code is unchanged, because it uses `videoRef` which we just defined to fallback.
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const [isLoading, setIsLoading] = useState(!initialStream);
    const [hasError, setHasError] = useState(false);

    // Store latest callbacks in refs to avoid effect dependency issues
    const onStreamReadyRef = useRef(onStreamReady);
    const onErrorRef = useRef(onError);
    const onStatusChangeRef = useRef(onStatusChange);

    useEffect(() => {
        onStreamReadyRef.current = onStreamReady;
        onErrorRef.current = onError;
        onStatusChangeRef.current = onStatusChange;
    }, [onStreamReady, onError, onStatusChange]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        if (initialStream) {
            video.srcObject = initialStream;
            setIsLoading(false);
            setHasError(false);
            onStatusChangeRef.current?.('online');
            return;
        }

        if (!streamUrl) {
            setIsLoading(false);
            return;
        }

        let monitorInterval: number | undefined;
        let playTimeout: number | undefined;

        const startWebRtc = async () => {
            try {
                setIsLoading(true);
                setHasError(false);
                onStatusChangeRef.current?.('loading');

                const pc = new RTCPeerConnection({
                    iceServers: iceServers && iceServers.length > 0
                        ? iceServers
                        : [{ urls: 'stun:stun.l.google.com:19302' }]
                });
                pcRef.current = pc;

                pc.oniceconnectionstatechange = () => {
                    // logger.info(`ICE State [${streamUrl}]: ${pc.iceConnectionState}`);
                    if (pc.iceConnectionState === 'failed') {
                        handleError(new Error('WebRTC ICE Connection Failed'));
                    } else if (pc.iceConnectionState === 'disconnected') {
                        onStatusChangeRef.current?.('retrying');
                    } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                        onStatusChangeRef.current?.('online');
                    }
                };

                pc.ontrack = (event) => {
                    const stream = event.streams[0];
                    if (video) video.srcObject = stream;
                    onStreamReadyRef.current?.(stream);
                    onStatusChangeRef.current?.('online');
                };

                pc.addTransceiver('video', { direction: 'recvonly' });
                pc.addTransceiver('audio', { direction: isTalking ? 'sendrecv' : 'recvonly' });

                if (isTalking) {
                    try {
                        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        micStreamRef.current = micStream;
                        micStream.getTracks().forEach(track => {
                            pc.addTrack(track, micStream);
                        });
                    } catch (micErr) {
                        logger.warn("Microphone access denied or failed", micErr);
                        // Still proceed with recvonly if mic fails
                    }
                }

                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                await new Promise<void>((resolve) => {
                    if (pc.iceGatheringState === 'complete') resolve();
                    else {
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

                const response = await fetch(streamUrl, {
                    method: 'POST',
                    body: pc.localDescription!.sdp,
                    headers: { 'Content-Type': 'application/sdp' }
                });
                if (!response.ok) throw new Error(`MediaMTX WebRTC error: ${response.status}`);

                const answerSdp = await response.text();
                await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

                // Monitor inactivity
                let lastBytes = 0;
                let ticks = 0;
                monitorInterval = setInterval(async () => {
                    if (!pc) return;
                    const stats = await pc.getStats();
                    stats.forEach(stat => {
                        if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
                            if ((stat as any).bytesReceived === lastBytes) ticks++;
                            else {
                                ticks = 0;
                                lastBytes = (stat as any).bytesReceived;
                            }
                            if (ticks > 10) handleError(new Error('WebRTC Data Inactivity (timeout 5s)'));
                        }
                    });
                }, 500) as unknown as number;

                // Play timeout
                playTimeout = setTimeout(() => {
                    if (!['connected', 'completed'].includes(pc.iceConnectionState)) {
                        handleError(new Error('WebRTC Connection Timeout (4s)'));
                    }
                }, 4000) as unknown as number;

                // setIsLoading(false); // Removed to avoid flash, logic handled by status change
            } catch (err) {
                handleError(err as Error);
            }
        };

        const handleError = (err: Error) => {
            // logger.error('WebRTC failed', err);
            setHasError(true);
            setIsLoading(false);
            onStatusChangeRef.current?.('failed');
            onErrorRef.current?.(err);
            cleanup();
        };

        const cleanup = () => {
            if (pcRef.current) {
                pcRef.current.close();
                pcRef.current = null;
            }
            if (monitorInterval) clearInterval(monitorInterval);
            if (playTimeout) clearTimeout(playTimeout);
            if (micStreamRef.current) {
                micStreamRef.current.getTracks().forEach(t => t.stop());
                micStreamRef.current = null;
            }
        };

        startWebRtc();

        return () => cleanup();
    }, [streamUrl, initialStream, iceServers, isTalking, videoRef]); // Added videoRef dep

    useEffect(() => {
        const video = videoRef.current;
        if (video && autoPlay && !isLoading && !hasError) {
            video.play().catch(err => logger.warn('WebRTC autoplay failed', err));
        }
    }, [autoPlay, isLoading, hasError, videoRef]);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.muted = muted;
        }
    }, [muted, videoRef]);

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
                    Optimizing stream for compatibility...
                </div>
            )}
        </div>
    );
};

export default WebRtcPlayer;
