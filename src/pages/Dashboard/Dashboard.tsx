import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Typography, Modal, Empty, Spin, Button, message } from 'antd';
import {
    EyeOutlined, CloseOutlined, CameraOutlined, PlayCircleOutlined, StopOutlined,
    AudioOutlined, AudioMutedOutlined, InteractionOutlined, MenuOutlined,
    LeftOutlined, RightOutlined, PauseCircleOutlined,
    FullscreenOutlined, FullscreenExitOutlined, MenuFoldOutlined, MenuUnfoldOutlined
} from '@ant-design/icons';
import { captureVideoFrame } from '../../utils/screenshotUtils';
import { startRecording, captureStreamFromVideo, RecordingSession } from '../../utils/recordUtils';
import { Camera } from '../../types';
import { cameraService, streamService } from '../../services/apiService';
import { BASE_URL } from '../../api/client';
import WebRtcPlayer from '../../components/WebRtcPlayer';
import Hls from 'hls.js';
import LazyCameraCard from '../../components/LazyCameraCard';
import DashboardSidebar from '../../components/DashboardSidebar/DashboardSidebar';
import { logger } from '../../utils/logger';
import './Dashboard.scss';

const { Title, Text } = Typography;

interface VideoStreamModalProps {
    open: boolean;
    camera: Camera | null;
    initialStream?: MediaStream | null;
    onClose: () => void;
    startTalking?: boolean;
}

const VideoStreamModal: React.FC<VideoStreamModalProps> = React.memo(({ open, camera, initialStream, onClose, startTalking }) => {
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
    const recordingSessionRef = useRef<RecordingSession | null>(null);
    const modalVideoRef = useRef<HTMLVideoElement>(null);

    const handleStatusChange = useCallback((status: 'loading' | 'online' | 'retrying' | 'failed') => {
        setStreamStatus(status);
    }, []);

    const handleWebRtcError = useCallback((err: Error) => {
        logger.warn("Modal WebRTC Error:", err);
        if (hlsUrl) {
            setUseHlsFallback(true);
        } else if (retryCount < 1) {
            setTimeout(() => setRetryCount(prev => prev + 1), 1000);
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
            modalVideoRef.current.play().catch(err => logger.warn('Modal autoplay failed', err));
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
    }, [open, camera, initialStream, retryCount]);

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
                    onClick={() => setIsMuted(prev => !prev)}
                    type={!isMuted ? 'primary' : 'default'}
                >
                    {isMuted ? 'Unmute' : 'Mute'}
                </Button>,
                // <Button
                //     key="talk"
                //     type={isTalking ? 'primary' : 'default'}
                //     danger={isTalking}
                //     icon={<InteractionOutlined />}
                //     onClick={() => setIsTalking(prev => !prev)}
                // >
                //     {isTalking ? 'Stop Speaking' : 'Speak to Camera'}
                // </Button>,
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
                {open && initialStream && !isTalking ? (
                    <video ref={modalVideoRef} autoPlay muted={isMuted} playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : camera && webRtcUrl && !hasError && !useHlsFallback ? (
                    <WebRtcPlayer
                        streamUrl={webRtcUrl}
                        iceServers={iceServers}
                        autoPlay
                        muted={isMuted}
                        isTalking={isTalking}
                        onStatusChange={handleStatusChange}
                        onError={handleWebRtcError}
                    />
                ) : useHlsFallback && hlsUrl ? (
                    <video
                        ref={el => {
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
                                        el.play().catch(e => logger.warn("HLS Modal play error:", e));
                                    });
                                    hls.on(Hls.Events.ERROR, (_, data) => {
                                        if (data.fatal) {
                                            setHasError(true);
                                            setStreamStatus('failed');
                                        } else setStreamStatus('retrying');
                                    });
                                } else if (el.canPlayType('application/vnd.apple.mpegurl')) {
                                    el.src = hlsUrl;
                                    setStreamStatus('online');
                                    el.play().catch(e => logger.warn("HLS Modal native play error:", e));
                                }
                            }
                        }}
                        autoPlay
                        controls
                        muted={isMuted}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                ) : hasError ? (
                    <div className="modal-error-overlay" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff', gap: '16px' }}>
                        <Text style={{ color: '#ff4d4f' }}>
                            {retryCount >= 3 ? "Stream not found. The camera might be offline." : "Connecting to stream..."}
                        </Text>
                        {retryCount < 3 && <Spin />}
                        {retryCount >= 3 && (
                            <button onClick={() => { setRetryCount(0); setHasError(false); }} style={{ background: '#1890ff', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Retry Connection</button>
                        )}
                    </div>
                ) : (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                        <Spin size="large" />
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
}) => {
    const [currentPage, setCurrentPage] = useState(0);
    const [isAutoRotating, setIsAutoRotating] = useState(true);
    const GRID_SIZE = 12;
    const ROTATION_MS = 30000;

    const totalPages = Math.ceil(cameras.length / GRID_SIZE);

    useEffect(() => {
        if (currentPage >= totalPages && totalPages > 0) {
            setCurrentPage(0);
        }
    }, [cameras.length, totalPages, currentPage]);

    const currentCameras = useMemo(() => {
        const start = currentPage * GRID_SIZE;
        return cameras.slice(start, start + GRID_SIZE);
    }, [cameras, currentPage]);

    const handlePrevPage = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentPage((prev) => (prev - 1 + totalPages) % totalPages);
        setIsAutoRotating(false);
    }, [totalPages]);

    const handleNextPage = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentPage((prev) => (prev + 1) % totalPages);
        setIsAutoRotating(false);
    }, [totalPages]);

    const toggleAutoRotation = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setIsAutoRotating(prev => !prev);
    }, []);

    useEffect(() => {
        if (!isAutoRotating || cameras.length <= GRID_SIZE || isModalOpen) return;

        const interval = setInterval(() => {
            setCurrentPage(prev => (prev + 1) % totalPages);
        }, ROTATION_MS);

        return () => clearInterval(interval);
    }, [isAutoRotating, cameras.length, totalPages, isModalOpen]);

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
                    <Title level={4} style={{ margin: 0 }}>Selected Cameras ({cameras.length})</Title>
                </div>

                <div className="pagination-controls" onClick={e => e.stopPropagation()}>
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
                            >
                                <span className="btn-text">{isAutoRotating ? 'Pause' : 'Auto-Rotate'}</span>
                            </Button>
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
                    <LazyCameraCard
                        key={`${camera.id}-${idx}`}
                        camera={camera}
                        onClick={onCameraClick}
                        onStreamReady={onStreamReady}
                        index={idx}
                    />
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

    const handleCameraClick = useCallback((camera: Camera, stream?: MediaStream, startTalking?: boolean) => {
        setVideoModal({ open: true, camera, stream: stream || activeStreams.get(String(camera.id)) || null, startTalking });
    }, [activeStreams]);

    const handleCloseModal = useCallback(() => {
        setVideoModal(prev => ({ ...prev, open: false }));
    }, []);

    const handleStreamReady = useCallback((camera: Camera, stream: MediaStream) => {
        setActiveStreams(prev => new Map(prev).set(String(camera.id), stream));
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
            setMobileSidebarOpen(prev => !prev);
        } else {
            setSidebarCollapsed(prev => !prev);
        }
    }, []);

    const toggleFullscreen = useCallback(() => {
        setIsFullscreen(prev => !prev);
        // When entering full screen, also collapse sidebar on desktop
        if (!isFullscreen && window.innerWidth > 768) {
            setSidebarCollapsed(true);
        }
    }, [isFullscreen]);

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
            />
        </div>
    );
};

export default Dashboard;
