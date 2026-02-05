import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Typography, Modal, Empty, Spin, Button, message, Select } from 'antd';
import {
    EyeOutlined, CloseOutlined, CameraOutlined, PlayCircleOutlined, StopOutlined,
    AudioOutlined, AudioMutedOutlined, InteractionOutlined, MenuOutlined,
    LeftOutlined, RightOutlined, PauseCircleOutlined,
    FullscreenOutlined, FullscreenExitOutlined, MenuFoldOutlined, MenuUnfoldOutlined
} from '@ant-design/icons';
import { captureVideoFrame } from '../../utils/screenshotUtils';
import { startRecording, captureStreamFromVideo, RecordingSession } from '../../utils/recordUtils';
import { Camera, CAM_STATUS } from '../../types';
import { cameraService, streamService } from '../../services/apiService';
import { BASE_URL } from '../../api/client';
import WebRtcPlayer from '../../components/WebRtcPlayer';
import Hls from 'hls.js';
import LazyCameraCard from '../../components/LazyCameraCard';
import DashboardSidebar from '../../components/DashboardSidebar/DashboardSidebar';
import CameraOverview from '../../components/CameraOverview/CameraOverview';
import { logger } from '../../utils/logger';
import './Dashboard.scss';

const { Title, Text } = Typography;

interface VideoStreamModalProps {
    open: boolean;
    camera: Camera | null;
    initialStream?: MediaStream | null;
    onClose: () => void;
    startTalking?: boolean;
    cachedStreamInfo?: { webRtcUrl?: string; hlsUrl?: string; iceServers?: any[] };
    onCacheStreamInfo?: (info: { webRtcUrl?: string; hlsUrl?: string; iceServers?: any[] }) => void;
}

const VideoStreamModal: React.FC<VideoStreamModalProps> = React.memo(({ open, camera, initialStream, onClose, startTalking, cachedStreamInfo, onCacheStreamInfo }: VideoStreamModalProps) => {
    const [webRtcUrl, setWebRtcUrl] = useState<string | null>(null);
    const [hlsUrl, setHlsUrl] = useState<string | null>(null);
    const [useHlsFallback, setUseHlsFallback] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const [iceServers, setIceServers] = useState<any[]>([]);
    const [streamStatus, setStreamStatus] = useState<string>('loading');
    const [isMuted, setIsMuted] = useState(true);
    const [isRecording, setIsRecording] = useState(false);
    const [isTalking, setIsTalking] = useState(false);
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const recordingSessionRef = useRef<RecordingSession | null>(null);
    const modalVideoRef = useRef<HTMLVideoElement>(null);

    const handleStatusChange = useCallback((status: 'loading' | 'online' | 'retrying' | 'failed') => {
        setStreamStatus(status);
        if (status === 'online') {
            setIsVideoPlaying(true);
        }
    }, []);

    const handleWebRtcError = useCallback((err: Error) => {
        logger.warn("Modal WebRTC Error:", err);
        if (hlsUrl) {
            setUseHlsFallback(true);
        } else if (retryCount < 1) {
            setTimeout(() => setRetryCount((prev: number) => prev + 1), 1000);
        } else {
            setHasError(true);
        }
    }, [hlsUrl, retryCount]);

    // Reset modal state when closed
    useEffect(() => {
        if (!open) {
            setWebRtcUrl(null);
            setHlsUrl(null);
            setUseHlsFallback(false);
            setRetryCount(0);
            setHasError(false);
            setIceServers([]);
            setStreamStatus('loading');
            setIsVideoPlaying(false);
            if (modalVideoRef.current) modalVideoRef.current.srcObject = null;
            if (recordingSessionRef.current) {
                recordingSessionRef.current.stop();
                recordingSessionRef.current = null;
            }
            setIsRecording(false);
            setIsMuted(true);
            setIsTalking(false);
        } else {
            setIsTalking(!!startTalking);
        }
    }, [open, startTalking]);

    // Attach initial stream
    useEffect(() => {
        if (open && initialStream && modalVideoRef.current) {
            modalVideoRef.current.srcObject = initialStream;
            setStreamStatus('online');
            modalVideoRef.current.play().then(() => setIsVideoPlaying(true)).catch((err: Error) => logger.warn('Modal autoplay failed', err));
        }
    }, [open, initialStream]);

    // Handle explicit unmuting for the video element (useful for HLS fallback)
    useEffect(() => {
        if (modalVideoRef.current) {
            modalVideoRef.current.muted = isMuted;
            if (!isMuted) {
                modalVideoRef.current.play().catch(() => { });
            }
        }
    }, [isMuted]);

    // Resolve stream URLs (WebRTC / HLS)
    useEffect(() => {
        const resolveStreamUrl = async () => {
            if (!open || !camera?.streamUrl || initialStream) return;

            // Check if we have cached info first
            if (cachedStreamInfo && !retryCount) { // If retrying, we might want to refetch, or use cache? Let's refetch if retrying to be safe, but for initial load use cache.
                // Actually, if we are retrying, we probably want to re-fetch freshly. 
                // But for the FIRST load (retryCount === 0), use cache.
                if (cachedStreamInfo.webRtcUrl) setWebRtcUrl(cachedStreamInfo.webRtcUrl);
                if (cachedStreamInfo.hlsUrl) setHlsUrl(cachedStreamInfo.hlsUrl);
                if (cachedStreamInfo.iceServers) setIceServers(cachedStreamInfo.iceServers);
                return;
            }

            let streamUrl = camera.streamUrl;
            setHasError(false);

            if (!streamUrl.startsWith('http://') && !streamUrl.startsWith('https://')) {
                streamUrl = `${BASE_URL}${streamUrl}`;
            }

            if (streamUrl.endsWith('/info')) {
                try {
                    const parts = streamUrl.split('?')[0].split('/');
                    const infoIdx = parts.indexOf('info');
                    if (infoIdx >= 2) {
                        const nvrId = parts[infoIdx - 2];
                        const channelId = parseInt(parts[infoIdx - 1]);
                        const streamInfo = await streamService.getStreamInfo(nvrId, channelId);

                        if (streamInfo.webRtcUrl) setWebRtcUrl(streamInfo.webRtcUrl);
                        if (streamInfo.hlsUrl) setHlsUrl(streamInfo.hlsUrl);
                        if (streamInfo.iceServers) setIceServers(streamInfo.iceServers);

                        // Cache the result
                        if (onCacheStreamInfo) {
                            onCacheStreamInfo({
                                webRtcUrl: streamInfo.webRtcUrl,
                                hlsUrl: streamInfo.hlsUrl,
                                iceServers: streamInfo.iceServers
                            });
                        }
                    }
                } catch (error) {
                    logger.error("Failed to fetch stream info", error);
                    setHasError(true);
                }
            } else {
                setWebRtcUrl(streamUrl);
            }
        };

        resolveStreamUrl();
    }, [open, camera, initialStream, retryCount, cachedStreamInfo, onCacheStreamInfo]);

    const handleScreenshot = () => {
        captureVideoFrame(modalVideoRef.current, camera?.name || 'camera');
    };

    const handleToggleRecording = () => {
        if (isRecording) {
            if (recordingSessionRef.current) {
                recordingSessionRef.current.stop();
                recordingSessionRef.current = null;
                setIsRecording(false);
                message.success('Recording saved successfully');
            }
        } else {
            let stream: MediaStream | null = initialStream || null;
            if (!stream && modalVideoRef.current) {
                stream = captureStreamFromVideo(modalVideoRef.current);
            }

            if (stream) {
                const session = startRecording(stream, camera?.name || 'camera');
                recordingSessionRef.current = session;
                setIsRecording(true);
                message.info('Recording started');
            } else {
                message.error('Could not start recording: No active stream');
            }
        }
    };

    const isLoading = !hasError && !isVideoPlaying && (streamStatus === 'loading' || streamStatus === 'retrying');

    return (
        <Modal
            title={<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><EyeOutlined /> {camera?.name}</div>}
            open={open}
            onCancel={onClose}
            footer={[
                // <Button
                //     key="record"
                //     danger={isRecording}
                //     icon={isRecording ? <StopOutlined /> : <PlayCircleOutlined />}
                //     onClick={handleToggleRecording}
                // >
                //     {isRecording ? 'Stop Recording' : 'Start Recording'}
                // </Button>,
                <Button
                    key="audio"
                    icon={isMuted ? <AudioMutedOutlined /> : <AudioOutlined />}
                    onClick={() => setIsMuted((prev: boolean) => !prev)}
                    type={!isMuted ? 'primary' : 'default'}
                >
                    {isMuted ? 'Unmute' : 'Mute'}
                </Button>,
                <Button
                    key="talk"
                    type={isTalking ? 'primary' : 'default'}
                    danger={isTalking}
                    icon={<InteractionOutlined />}
                    onClick={() => setIsTalking(prev => !prev)}
                >
                    {isTalking ? 'Stop Speaking' : 'Speak to Camera'}
                </Button>,
                <Button
                    key="screenshot"
                    icon={<CameraOutlined />}
                    onClick={handleScreenshot}
                >
                    Take Screenshot
                </Button>,
                <Button key="close" type="primary" onClick={onClose}>
                    Close
                </Button>
            ]}
            width="80vw"
            centered
            className="fullscreen-video-modal"
            closeIcon={<CloseOutlined style={{ fontSize: '20px', color: '#fff' }} />}
        >
            <div className="modal-video-container" style={{ position: 'relative', width: '100%', height: '70vh', background: '#000' }}>
                {isRecording && (
                    <div className="recording-indicator">
                        <div className="recording-dot" />
                        REC
                    </div>
                )}
                {isTalking && (
                    <div className="talking-indicator">
                        <div className="talking-dot" />
                        SPEAKING
                    </div>
                )}
                {/* Video Elements */}
                {open && initialStream && !isTalking ? (
                    <video
                        ref={modalVideoRef}
                        autoPlay
                        muted={isMuted}
                        playsInline
                        onPlaying={() => setIsVideoPlaying(true)}
                        style={{ width: '100%', height: '100%', objectFit: 'contain', display: isVideoPlaying ? 'block' : 'none' }}
                    />
                ) : camera && webRtcUrl && !hasError && !useHlsFallback ? (
                    <div style={{ display: isVideoPlaying ? 'block' : 'none', width: '100%', height: '100%' }}>
                        <WebRtcPlayer
                            streamUrl={webRtcUrl}
                            iceServers={iceServers}
                            autoPlay
                            muted={isMuted}
                            isTalking={isTalking}
                            onStatusChange={handleStatusChange}
                            onError={handleWebRtcError}
                            videoRef={modalVideoRef}
                        />
                    </div>
                ) : useHlsFallback && hlsUrl ? (
                    <video
                        ref={(el: HTMLVideoElement | null) => {
                            if (el && hlsUrl) {
                                if (Hls.isSupported()) {
                                    const hls = new Hls({
                                        liveSyncDuration: 2,
                                        liveMaxLatencyDuration: 4,
                                        maxBufferLength: 5,
                                        manifestLoadingMaxRetry: 10,
                                        levelLoadingMaxRetry: 10,
                                        fragLoadingMaxRetry: 10
                                    });
                                    hls.loadSource(hlsUrl);
                                    hls.attachMedia(el);
                                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                                        setStreamStatus('online');
                                        el.play().catch((e: Error) => logger.warn("HLS Modal play error:", e));
                                    });
                                    hls.on(Hls.Events.ERROR, (_: any, data: any) => {
                                        if (data.fatal) {
                                            setHasError(true);
                                            setStreamStatus('failed');
                                        } else setStreamStatus('retrying');
                                    });
                                } else if (el.canPlayType('application/vnd.apple.mpegurl')) {
                                    el.src = hlsUrl;
                                    setStreamStatus('online');
                                    el.play().catch((e: Error) => logger.warn("HLS Modal native play error:", e));
                                }
                            }
                        }}
                        autoPlay
                        controls
                        muted={isMuted}
                        onPlaying={() => setIsVideoPlaying(true)}
                        style={{ width: '100%', height: '100%', objectFit: 'contain', display: isVideoPlaying ? 'block' : 'none' }}
                    />
                ) : null}

                {/* Loading / Error States */}
                {hasError ? (
                    <div className="modal-error-overlay" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff', gap: '16px' }}>
                        <Text style={{ color: '#ff4d4f' }}>
                            {retryCount >= 1 ? "Stream not found. The camera might be offline." : "Connecting to stream..."}
                        </Text>
                        {retryCount < 1 && <Spin />}
                        {(retryCount >= 1 || hasError) && (
                            <button onClick={() => { setRetryCount(0); setHasError(false); }} style={{ background: '#1890ff', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Retry Connection</button>
                        )}
                    </div>
                ) : isLoading && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', position: 'absolute', top: 0, left: 0, width: '100%', zIndex: 10 }}>
                        <Spin size="large" tip="Loading Stream..." />
                    </div>
                )}
            </div>
        </Modal>
    );
});

interface SelectedCameraGridProps {
    cameras: Camera[];
    onCameraClick: (camera: Camera, stream?: MediaStream, startTalking?: boolean) => void;
    onStreamReady?: (camera: Camera, stream: MediaStream) => void;
    isModalOpen: boolean;
    isFullscreen: boolean;
    onToggleFullscreen: () => void;
}

const SelectedCameraGrid: React.FC<SelectedCameraGridProps> = ({
    cameras,
    onCameraClick,
    onStreamReady,
    isModalOpen,
    isFullscreen,
    onToggleFullscreen
}: SelectedCameraGridProps) => {
    const [currentPage, setCurrentPage] = useState(0);
    const [isAutoRotating, setIsAutoRotating] = useState(true);
    const [gridSize, setGridSize] = useState(12);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const [rotationInterval, setRotationInterval] = useState(120000); // Default 2 min
    const ROTATION_MS = rotationInterval;

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const totalPages = Math.ceil(cameras.length / gridSize);

    useEffect(() => {
        if (currentPage >= totalPages && totalPages > 0) {
            setCurrentPage(0);
        }
    }, [cameras.length, totalPages, currentPage]);

    const currentCameras = useMemo(() => {
        const start = currentPage * gridSize;
        return cameras.slice(start, start + gridSize);
    }, [cameras, currentPage, gridSize]);

    const handlePrevPage = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentPage((prev: number) => (prev - 1 + totalPages) % totalPages);
        setIsAutoRotating(false);
    }, [totalPages]);

    const handleNextPage = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentPage((prev: number) => (prev + 1) % totalPages);
        setIsAutoRotating(false);
    }, [totalPages]);

    const toggleAutoRotation = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setIsAutoRotating((prev: boolean) => !prev);
    }, []);

    useEffect(() => {
        if (!isAutoRotating || cameras.length <= gridSize || isModalOpen) return;

        const interval = setInterval(() => {
            setCurrentPage((prev: number) => (prev + 1) % totalPages);
        }, ROTATION_MS);

        return () => clearInterval(interval);
    }, [isAutoRotating, cameras.length, totalPages, isModalOpen]);

    // Dynamic grid math
    const getGridDimensions = (size: number, count: number) => {
        // Mobile: 1 column
        if (windowWidth <= 768) return { cols: 1, rows: size };

        // Tablet: 2 or 3 columns
        if (windowWidth <= 1024) {
            if (size <= 4) return { cols: 2, rows: 2 };
            if (size <= 9) return { cols: 3, rows: 3 };
            return { cols: 3, rows: 4 };
        }

        // Desktop
        if (size <= 4) return { cols: 2, rows: 2 };
        if (size <= 6) return { cols: 3, rows: 2 };
        if (size <= 8) return { cols: 4, rows: 2 };
        if (size <= 12) return { cols: 4, rows: 3 };
        if (size <= 16) return { cols: 4, rows: 4 };
        if (size <= 20) return { cols: 5, rows: 4 };
        if (size <= 25) return { cols: 5, rows: 5 };
        return { cols: 8, rows: 4 }; // 32
    };

    const { cols, rows } = getGridDimensions(gridSize, currentCameras.length);

    // Gap compensation (8px gap)
    const gap = 8;
    const isMobile = windowWidth <= 768;
    const widthPct = isMobile ? '100%' : `calc((100% - ${(cols - 1) * gap}px) / ${cols})`;
    const heightPct = isMobile ? 'auto' : `calc((100% - ${(rows - 1) * gap}px) / ${rows})`;

    const useSubstream = gridSize > 6;

    if (!cameras || cameras.length === 0) {
        return (
            <div className="empty-grid-container">
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                        <Text type="secondary" style={{ fontSize: '18px' }}>
                            Please select <b>Cameras</b> from the left panel to begin monitoring
                        </Text>
                    }
                />
            </div>
        );
    }

    return (
        <div className={`nvr-grid-container ${isFullscreen ? 'fullscreen' : ''}`}>
            <div className="grid-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Title level={4} style={{ margin: 0 }}>Cameras ({cameras.length})</Title>
                    <Select
                        value={gridSize}
                        style={{ width: 100 }}
                        onChange={(value: number) => {
                            setGridSize(value);
                            setCurrentPage(0);
                        }}
                        options={[
                            { value: 6, label: '6 View' },
                            { value: 12, label: '12 View' },
                            { value: 32, label: '32 View' },
                        ]}
                        onClick={e => e.stopPropagation()}
                    />
                </div>

                <div className="pagination-controls" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                    {totalPages > 1 && (
                        <>
                            <div className="pagination-buttons">
                                <Button
                                    onClick={handlePrevPage}
                                    size="small"
                                    icon={<LeftOutlined />}
                                >
                                    <span className="btn-text">Previous</span>
                                </Button>
                                <Button
                                    onClick={handleNextPage}
                                    size="small"
                                    icon={<RightOutlined />}
                                    style={{ flexDirection: 'row-reverse' }}
                                >
                                    <span className="btn-text">Next</span>
                                </Button>
                            </div>
                            <div className="pagination-info">
                                Page {currentPage + 1} of {totalPages} • Showing {currentCameras.length} cameras
                            </div>
                            <Button
                                onClick={toggleAutoRotation}
                                type={isAutoRotating ? 'primary' : 'default'}
                                size="small"
                                className="pagination-auto-rotate"
                                icon={isAutoRotating ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                                style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                            >
                                <span className="btn-text">{isAutoRotating ? 'Pause' : 'Auto-Rotate'}</span>
                            </Button>
                            <Select
                                value={rotationInterval}
                                size="small"
                                onChange={(val: number) => setRotationInterval(val)}
                                options={[
                                    { value: 60000, label: '1m' },
                                    { value: 120000, label: '2m' },
                                    { value: 180000, label: '3m' },
                                    { value: 360000, label: '6m' },
                                    { value: 540000, label: '9m' },
                                ]}
                                style={{ width: 65 }}
                                className="timer-select"
                            />
                        </>
                    )}

                    <Button
                        onClick={onToggleFullscreen}
                        size="small"
                        type={isFullscreen ? 'primary' : 'default'}
                        icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                    >
                        <span className="btn-text">{isFullscreen ? 'Exit Full Screen' : 'Full Screen'}</span>
                    </Button>
                </div>
            </div>
            <div className="video-grid">
                {currentCameras.map((camera: Camera, idx: number) => (
                    <div
                        key={`${camera.id}-${idx}`}
                        style={{ width: widthPct, height: heightPct }}
                    >
                        <LazyCameraCard
                            camera={camera}
                            onClick={onCameraClick}
                            onStreamReady={onStreamReady}
                            index={idx}
                            useSubstream={useSubstream}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};

const Dashboard: React.FC = () => {
    const [allCameras, setAllCameras] = useState<Camera[]>([]);
    const [selectedCameraIds, setSelectedCameraIds] = useState<string[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [videoModal, setVideoModal] = useState<{ open: boolean; camera: Camera | null; stream: MediaStream | null; startTalking?: boolean }>({ open: false, camera: null, stream: null });
    const [activeStreams, setActiveStreams] = useState<Map<string, MediaStream>>(new Map());
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [streamInfoCache, setStreamInfoCache] = useState<Map<string, { webRtcUrl?: string; hlsUrl?: string; iceServers?: any[] }>>(new Map());

    const handleCacheStreamInfo = useCallback((cameraId: string, info: { webRtcUrl?: string; hlsUrl?: string; iceServers?: any[] }) => {
        setStreamInfoCache((prev: Map<string, any>) => new Map(prev).set(cameraId, info));
    }, []);

    const handleCameraClick = useCallback((camera: Camera, stream?: MediaStream, startTalking?: boolean) => {
        setVideoModal({ open: true, camera, stream: stream || activeStreams.get(String(camera.id)) || null, startTalking });
    }, [activeStreams]);

    const handleCloseModal = useCallback(() => {
        setVideoModal((prev: any) => ({ ...prev, open: false }));
    }, []);

    const handleStreamReady = useCallback((camera: Camera, stream: MediaStream) => {
        setActiveStreams((prev: Map<string, MediaStream>) => new Map(prev).set(String(camera.id), stream));
    }, []);

    const handleSelectionChange = useCallback((ids: string[]) => {
        setSelectedCameraIds(ids);
        // Close sidebar on mobile after selection
        if (window.innerWidth <= 768) {
            setMobileSidebarOpen(false);
        }
    }, []);

    const toggleSidebar = useCallback(() => {
        if (window.innerWidth <= 768) {
            setMobileSidebarOpen((prev: boolean) => !prev);
        } else {
            setSidebarCollapsed((prev: boolean) => !prev);
        }
    }, []);

    const toggleFullscreen = useCallback(() => {
        setIsFullscreen((prev: boolean) => !prev);
        // When entering full screen, also collapse sidebar on desktop
        if (!isFullscreen && window.innerWidth > 768) {
            setSidebarCollapsed(true);
        }
    }, [isFullscreen]);

    const handleCheckNvrStatus = useCallback(async (nvrName: string, cameras: Camera[]) => {
        const checkStatus = async () => {
            const statusPromises = cameras.map(async (cam) => {
                try {
                    if (cam.streamUrl && cam.streamUrl.includes('/info')) {
                        const parts = cam.streamUrl.split('?')[0].split('/');
                        const infoIdx = parts.indexOf('info');
                        if (infoIdx >= 2) {
                            const nvrId = parts[infoIdx - 2];
                            const channelId = parseInt(parts[infoIdx - 1]);
                            await streamService.getStreamInfo(nvrId, channelId);
                            return { ...cam, status: CAM_STATUS.ONLINE };
                        }
                    }
                    return { ...cam, status: CAM_STATUS.ONLINE };
                } catch (e) {
                    return { ...cam, status: CAM_STATUS.OFFLINE };
                }
            });

            const updatedCameras = await Promise.all(statusPromises);
            setAllCameras((prev: Camera[]) => {
                const updated = [...prev];
                updatedCameras.forEach(uc => {
                    const idx = updated.findIndex(c => c.id === uc.id);
                    if (idx !== -1) updated[idx] = uc;
                });
                return updated;
            });
        };
        await checkStatus();
    }, []);

    useEffect(() => {
        const fetchAllCameras = async () => {
            try {
                setLoading(true);
                const cameras = await cameraService.getAll();
                setAllCameras(cameras);
            } catch (error) {
                logger.error("Failed to fetch cameras", error);
            } finally {
                setLoading(false);
            }
        };
        fetchAllCameras();
    }, []);

    const selectedCameras = useMemo(() => {
        return allCameras.filter(cam => selectedCameraIds.includes(String(cam.id)));
    }, [allCameras, selectedCameraIds]);

    const handleOverviewCameraSelect = useCallback((camera: Camera) => {
        handleCameraClick(camera);
    }, [handleCameraClick]);

    return (
        <div className={`dashboard-container ${isFullscreen ? 'fullscreen-mode' : ''}`}>
            <DashboardSidebar
                cameras={allCameras}
                selectedCameraIds={selectedCameraIds}
                onSelectionChange={handleSelectionChange}
                loading={loading}
                className={`${mobileSidebarOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}
            />

            {/* Overlay for mobile */}
            {mobileSidebarOpen && (
                <div
                    className="sidebar-overlay"
                    onClick={() => setMobileSidebarOpen(false)}
                />
            )}

            <div className="dashboard-main">
                {/* Mobile menu button / Desktop collapse button */}
                <button
                    className="mobile-menu-button"
                    onClick={toggleSidebar}
                    aria-label="Toggle menu"
                >
                    {sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                </button>

                {loading ? (
                    <div className="loading-container">
                        <Spin size="large" tip="Loading cameras..." />
                    </div>
                ) : selectedCameras.length === 0 ? (
                    <CameraOverview
                        cameras={allCameras}
                        onCameraSelect={handleOverviewCameraSelect}
                        onCheckNvrStatus={handleCheckNvrStatus}
                        onSelectionChange={handleSelectionChange}
                    />
                ) : (
                    <SelectedCameraGrid
                        cameras={selectedCameras}
                        onCameraClick={handleCameraClick}
                        onStreamReady={handleStreamReady}
                        isModalOpen={videoModal.open}
                        isFullscreen={isFullscreen}
                        onToggleFullscreen={toggleFullscreen}
                    />
                )}
            </div>

            <VideoStreamModal
                open={videoModal.open}
                camera={videoModal.camera}
                initialStream={videoModal.stream}
                onClose={handleCloseModal}
                startTalking={videoModal.startTalking}
                cachedStreamInfo={videoModal.camera ? streamInfoCache.get(String(videoModal.camera.id)) : undefined}
                onCacheStreamInfo={(info: any) => videoModal.camera && handleCacheStreamInfo(String(videoModal.camera.id), info)}
            />
        </div>
    );
};

export default Dashboard;
