import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Typography, Select, Modal, Empty, Spin, Collapse, Tag, Badge, Button, message } from 'antd';
import { GlobalOutlined, VideoCameraOutlined, CloseOutlined, EyeOutlined, DatabaseOutlined, CameraOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons';
import { captureVideoFrame } from '../../utils/screenshotUtils';
import { startRecording, captureStreamFromVideo, RecordingSession } from '../../utils/recordUtils';
import { Camera, NVR, NvrGroup } from '../../types';
import { cameraService, nvrService, streamService } from '../../services/apiService';
import { BASE_URL } from '../../api/client';
import WebRtcPlayer from '../../components/WebRtcPlayer';
import Hls from 'hls.js';
import { APP_CONFIG } from '../../constants';
import CameraCard from '../../components/CameraCard';
import LazyCameraCard from '../../components/LazyCameraCard';
import { logger } from '../../utils/logger';
import './Dashboard.scss';

const { Title } = Typography;
const { Option } = Select;

interface VideoStreamModalProps {
    open: boolean;
    camera: Camera | null;
    initialStream?: MediaStream | null;
    onClose: () => void;
}

const VideoStreamModal: React.FC<VideoStreamModalProps> = React.memo(({ open, camera, initialStream, onClose }) => {
    const [webRtcUrl, setWebRtcUrl] = useState<string | null>(null);
    const [hlsUrl, setHlsUrl] = useState<string | null>(null);
    const [useHlsFallback, setUseHlsFallback] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const [iceServers, setIceServers] = useState<any[]>([]);
    const [streamStatus, setStreamStatus] = useState<string>('loading');
    const [isRecording, setIsRecording] = useState(false);
    const recordingSessionRef = useRef<RecordingSession | null>(null);
    const modalVideoRef = useRef<HTMLVideoElement>(null);

    const handleStatusChange = useCallback((status: 'loading' | 'online' | 'retrying' | 'failed') => {
        setStreamStatus(status);
    }, []);

    const handleWebRtcError = useCallback((err: Error) => {
        logger.warn("Modal WebRTC Error:", err);
        if (hlsUrl) {
            setUseHlsFallback(true);
        } else if (retryCount < 3) {
            setTimeout(() => setRetryCount(prev => prev + 1), 2000);
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
        }
    }, [open]);

    // Attach initial stream
    useEffect(() => {
        if (open && initialStream && modalVideoRef.current) {
            modalVideoRef.current.srcObject = initialStream;
            setStreamStatus('online');
            modalVideoRef.current.play().catch(err => logger.warn('Modal autoplay failed', err));
        }
    }, [open, initialStream]);

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

            // If it's an HLS stream (or no direct stream passed), capture from video element
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
                <Button
                    key="record"
                    danger={isRecording}
                    icon={isRecording ? <StopOutlined /> : <PlayCircleOutlined />}
                    onClick={handleToggleRecording}
                >
                    {isRecording ? 'Stop Recording' : 'Start Recording'}
                </Button>,
                <Button key="screenshot" icon={<CameraOutlined />} onClick={handleScreenshot}>
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
                {open && initialStream ? (
                    <video ref={modalVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : camera && webRtcUrl && !hasError && !useHlsFallback ? (
                    <WebRtcPlayer
                        streamUrl={webRtcUrl}
                        iceServers={iceServers}
                        autoPlay
                        muted
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
                        muted
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                ) : hasError ? (
                    <div className="modal-error-overlay" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff', gap: '16px' }}>
                        <Typography.Text style={{ color: '#ff4d4f' }}>
                            {retryCount >= 3 ? "Stream not found. The camera might be offline." : "Connecting to stream..."}
                        </Typography.Text>
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

const Dashboard: React.FC = () => {
    const [allCameras, setAllCameras] = useState<Camera[]>([]);
    const [filteredCameras, setFilteredCameras] = useState<Camera[]>([]);
    const [groupedCameras, setGroupedCameras] = useState<NvrGroup[]>([]);
    const [locations, setLocations] = useState<string[]>([]);
    const [allNvrs, setAllNvrs] = useState<NVR[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<string | undefined>(undefined);
    const [selectedNvr, setSelectedNvr] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState<boolean>(true);
    const [currentPage, setCurrentPage] = useState<number>(0);
    const [isAutoRotating, setIsAutoRotating] = useState<boolean>(true);
    const CAMERAS_PER_PAGE = 6;
    const ROTATION_INTERVAL = 45000;
    const [videoModal, setVideoModal] = useState<{ open: boolean; camera: Camera | null; stream: MediaStream | null }>({ open: false, camera: null, stream: null });
    const [activeStreams, setActiveStreams] = useState<Map<string, MediaStream>>(new Map());

    const handleCameraClick = useCallback((camera: Camera, stream?: MediaStream) => {
        setVideoModal({ open: true, camera, stream: stream || activeStreams.get(String(camera.id)) || null });
    }, [activeStreams]);

    const handleCloseModal = useCallback(() => {
        setVideoModal(prev => ({ ...prev, open: false }));
    }, []);

    const handleStreamReady = useCallback((camera: Camera, stream: MediaStream) => {
        setActiveStreams(prev => new Map(prev).set(String(camera.id), stream));
    }, []);

    // Fetch locations and NVRs
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                setLoading(true);
                const fetchedLocations = await nvrService.getLocations();
                setLocations(fetchedLocations);
                const fetchedNvrs = await nvrService.getAll();
                setAllNvrs(fetchedNvrs);
            } catch (error) {
                logger.error("Failed to fetch initial data", error);
            } finally {
                setLoading(false);
            }
        };
        fetchInitialData();
    }, []);

    // Fetch cameras based on selection
    useEffect(() => {
        const fetchFilteredStreams = async () => {
            if (!selectedLocation || !selectedNvr) {
                setFilteredCameras([]);
                setGroupedCameras([]);
                return;
            }

            try {
                setLoading(true);
                if (selectedNvr === 'All') {
                    const grouped = await nvrService.getGroupedStreams(selectedLocation);
                    setGroupedCameras(grouped);
                    setFilteredCameras([]);
                } else {
                    const streams = await cameraService.getStreams(selectedLocation, selectedNvr);
                    setFilteredCameras(streams);
                    setGroupedCameras([]);
                }
            } catch (error) {
                logger.error("Failed to fetch streams", error);
                setFilteredCameras([]);
                setGroupedCameras([]);
            } finally {
                setLoading(false);
            }
        };
        fetchFilteredStreams();
    }, [selectedLocation, selectedNvr]);

    const availableNvrs = allNvrs
        .filter(nvr => selectedLocation === 'All' || nvr.location === selectedLocation)
        .sort((a, b) => a.name.localeCompare(b.name));

    const totalActiveFeeds = (selectedLocation && selectedNvr)
        ? (selectedNvr === 'All'
            ? groupedCameras.reduce((acc, group) => acc + group.cameras.length, 0)
            : filteredCameras.length)
        : 0;

    const totalPages = Math.ceil(filteredCameras.length / CAMERAS_PER_PAGE);
    const startIndex = currentPage * CAMERAS_PER_PAGE;
    const endIndex = startIndex + CAMERAS_PER_PAGE;
    const currentCameras = filteredCameras.slice(startIndex, endIndex);

    const handlePrevPage = () => { setCurrentPage((prev) => (prev - 1 + totalPages) % totalPages); setIsAutoRotating(false); };
    const handleNextPage = () => { setCurrentPage((prev) => (prev + 1) % totalPages); setIsAutoRotating(false); };
    const toggleAutoRotation = () => setIsAutoRotating(prev => !prev);

    // Auto-rotation effect
    useEffect(() => {
        if (!isAutoRotating || filteredCameras.length === 0 || totalPages <= 1) return;
        const interval = setInterval(() => setCurrentPage(prev => (prev + 1) % totalPages), ROTATION_INTERVAL);
        return () => clearInterval(interval);
    }, [isAutoRotating, filteredCameras.length, totalPages]);

    return (
        <div className="page-content dashboard-page">
            <div className="dashboard-header">
                <div className="header-title-container">
                    <Title level={3} className="page-title">Live Monitoring</Title>
                    <p className="page-description">{totalActiveFeeds} Active Feeds</p>
                </div>
                <div className="selectors-container">
                    <Select
                        value={selectedLocation}
                        onChange={setSelectedLocation}
                        size="large"
                        suffixIcon={<GlobalOutlined />}
                        placeholder="Select Location"
                        allowClear
                    >
                        <Option value={APP_CONFIG.ALL_FILTER}>All Locations</Option>
                        {locations.map(loc => <Option key={loc} value={loc}>{loc}</Option>)}
                    </Select>
                    <Select
                        value={selectedNvr}
                        onChange={setSelectedNvr}
                        size="large"
                        suffixIcon={<VideoCameraOutlined />}
                        placeholder="Select NVR"
                        allowClear
                        disabled={!selectedLocation}
                    >
                        <Option value={APP_CONFIG.ALL_FILTER}>All NVRs</Option>
                        {availableNvrs.map(nvr => <Option key={nvr.id} value={nvr.id}>{nvr.name}</Option>)}
                    </Select>
                </div>
            </div>

            {loading ? (
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <Spin size="large" />
                </div>
            ) : (
                <>
                    {selectedNvr === 'All' ? (
                        <Collapse ghost className="nvr-collapse">
                            {groupedCameras.map(group => (
                                <Collapse.Panel key={group.nvrId} header={
                                    <div className="nvr-panel-header">
                                        <div className="nvr-title"><DatabaseOutlined /><span>{group.nvrName}</span><Badge count={group.cameras.length} color="#1890ff" /></div>
                                        <div className="nvr-badges">
                                            <Tag color="cyan">{group.nvrIp}</Tag>
                                            <Tag color="blue">{group.nvrType}</Tag>
                                            <Tag color="geekblue">Channel {group.cameras.length}</Tag>
                                        </div>
                                    </div>
                                }>
                                    <div className="video-grid nested">
                                        {group.cameras.map((camera, idx) => (
                                            <LazyCameraCard key={camera.id} camera={camera} onClick={handleCameraClick} index={idx} />
                                        ))}
                                    </div>
                                </Collapse.Panel>
                            ))}
                        </Collapse>
                    ) : (
                        <>
                            {totalPages > 1 && (
                                <div className="pagination-controls">
                                    <div className="pagination-buttons">
                                        <Button onClick={handlePrevPage} size="small">◀ Previous</Button>
                                        <Button onClick={handleNextPage} size="small">Next ▶</Button>
                                    </div>
                                    <div className="pagination-info">
                                        Page {currentPage + 1} of {totalPages} • Showing {currentCameras.length} of {filteredCameras.length} cameras
                                    </div>
                                    <Button
                                        onClick={toggleAutoRotation}
                                        type={isAutoRotating ? 'primary' : 'default'}
                                        size="small"
                                        className="pagination-auto-rotate"
                                    >
                                        {isAutoRotating ? '⏸ Pause' : '▶ Auto-Rotate'}
                                    </Button>
                                </div>
                            )}
                            <div className="video-grid">
                                {currentCameras.map((camera, idx) => (
                                    <LazyCameraCard key={camera.id} camera={camera} onClick={handleCameraClick} index={idx} />
                                ))}
                            </div>
                        </>
                    )}

                    {(!selectedLocation || !selectedNvr) && (
                        <div style={{ textAlign: 'center', marginTop: '100px' }}>
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Typography.Text type="secondary" style={{ fontSize: '18px' }}>Please select a <b>Location</b> and <b>NVR</b> to begin monitoring</Typography.Text>} />
                        </div>
                    )}

                    {selectedLocation && selectedNvr && filteredCameras.length === 0 && groupedCameras.length === 0 && (
                        <Empty description="No cameras found for the selection" />
                    )}
                </>
            )}

            <VideoStreamModal open={videoModal.open} camera={videoModal.camera} initialStream={videoModal.stream} onClose={handleCloseModal} />
        </div>
    );
};

export default Dashboard;
