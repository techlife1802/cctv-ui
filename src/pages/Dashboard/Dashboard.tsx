import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { Typography, Select, Modal, Empty, Spin, Collapse, Tag, Badge } from 'antd';
import { GlobalOutlined, VideoCameraOutlined, CloseOutlined, EyeOutlined, DatabaseOutlined } from '@ant-design/icons';
import { Camera, NVR, NvrGroup } from '../../types';
import { cameraService, nvrService } from '../../services/apiService';
import { BASE_URL } from '../../api/client';
import { APP_CONFIG } from '../../constants';
import CameraCard from '../../components/CameraCard';
import { logger } from '../../utils/logger';
import './Dashboard.scss';

const { Title } = Typography;
const { Option } = Select;

const Dashboard: React.FC = () => {
    const [allCameras, setAllCameras] = useState<Camera[]>([]);
    const [filteredCameras, setFilteredCameras] = useState<Camera[]>([]);
    const [groupedCameras, setGroupedCameras] = useState<NvrGroup[]>([]);
    const [locations, setLocations] = useState<string[]>([]);
    const [allNvrs, setAllNvrs] = useState<NVR[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<string | undefined>(undefined);
    const [selectedNvr, setSelectedNvr] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState<boolean>(true);
    const [videoModal, setVideoModal] = useState<{ open: boolean; camera: Camera | null }>({ open: false, camera: null });
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                setLoading(true);
                // Fetch locations from NVR API
                const fetchedLocations = await nvrService.getLocations();
                setLocations(fetchedLocations);

                // Default to first location if available (Actually, user wants Select Location by default)
                // const defaultLocation = fetchedLocations.length > 0 ? fetchedLocations[0] : 'All';
                // setSelectedLocation(defaultLocation);
                setSelectedLocation(undefined);

                // Fetch NVRs to populate dropdown
                const fetchedNvrs = await nvrService.getAll();
                setAllNvrs(fetchedNvrs);

                // Don't fetch cameras automatically on load
                const defaultData = await cameraService.getStreams(selectedLocation || APP_CONFIG.ALL_FILTER, APP_CONFIG.ALL_FILTER);
                // setFilteredCameras(defaultData);
                setLoading(false);
            } catch (error) {
                logger.error("Failed to fetch initial data", error);
            } finally {
                setLoading(false);
            }
        };
        fetchInitialData();
    }, []);

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
                    setFilteredCameras([]); // Clear individual cameras
                } else {
                    const streams = await cameraService.getStreams(selectedLocation, selectedNvr);
                    setFilteredCameras(streams);
                    setGroupedCameras([]); // Clear grouped cameras
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

    useEffect(() => {
        setSelectedNvr(undefined);
    }, [selectedLocation]);


    const availableNvrs = allNvrs
        .filter(nvr => selectedLocation === 'All' || nvr.location === selectedLocation)
        .sort((a, b) => a.name.localeCompare(b.name));

    const totalActiveFeeds = (selectedLocation && selectedNvr)
        ? (selectedNvr === 'All'
            ? groupedCameras.reduce((acc, group) => acc + group.cameras.length, 0)
            : filteredCameras.length)
        : 0;

    const handleCameraClick = (camera: Camera) => {
        setVideoModal({ open: true, camera });
    };

    // HLS player effect
    useEffect(() => {
        if (videoModal.open && videoModal.camera?.streamUrl && videoRef.current) {
            const video = videoRef.current;
            const streamUrl = `${BASE_URL}${videoModal.camera.streamUrl}`;

            if (Hls.isSupported()) {
                const hls = new Hls();
                hls.loadSource(streamUrl);
                hls.attachMedia(video);
                hls.startLoad();
                video.play().catch(() => { });

                return () => {
                    hls.destroy();
                };
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = streamUrl;
                video.play().catch(() => { });
            }
        }
    }, [videoModal]);

    return (
        <div className="page-content dashboard-page">
            <div className="dashboard-header">
                <div className="header-title-container">
                    <Title level={2} className="page-title">Live Monitoring</Title>
                    <p className="page-description">{totalActiveFeeds} Active Feeds</p>
                </div>

                <div className="selectors-container">
                    <Select
                        value={selectedLocation}
                        className="location-selector"
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
                        className="location-selector"
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
                                <Collapse.Panel
                                    key={group.nvrId}
                                    header={
                                        <div className="nvr-panel-header">
                                            <div className="nvr-title">
                                                <DatabaseOutlined />
                                                <span>{group.nvrName}</span>
                                                <Badge count={group.cameras.length} showZero color="#1890ff" />
                                            </div>
                                            <div className="nvr-badges">
                                                <Tag color="cyan">{group.nvrIp}</Tag>
                                                <Tag color="blue">{group.nvrType}</Tag>
                                                <Tag color="geekblue">Channel {group.cameras.length}</Tag>
                                            </div>
                                        </div>
                                    }
                                >
                                    <div className="video-grid nested">
                                        {group.cameras.map((camera, index) => (
                                            <CameraCard
                                                key={camera.id}
                                                camera={camera}
                                                onClick={handleCameraClick}
                                                index={index}
                                            />
                                        ))}
                                    </div>
                                </Collapse.Panel>
                            ))}
                        </Collapse>
                    ) : (
                        <div className="video-grid">
                            {filteredCameras.map((camera, index) => (
                                <CameraCard
                                    key={camera.id}
                                    camera={camera}
                                    onClick={handleCameraClick}
                                    index={index}
                                />
                            ))}
                        </div>
                    )}

                    {(!selectedLocation || !selectedNvr) && (
                        <div style={{ textAlign: 'center', marginTop: '100px' }}>
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={
                                    <Typography.Text type="secondary" style={{ fontSize: '18px' }}>
                                        Please select a <b>Location</b> and <b>NVR</b> to begin monitoring
                                    </Typography.Text>
                                }
                            />
                        </div>
                    )}

                    {selectedLocation && selectedNvr && filteredCameras.length === 0 && groupedCameras.length === 0 && (
                        <Empty description="No cameras found for the selection" />
                    )}
                </>
            )}

            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <EyeOutlined style={{ fontSize: '20px', color: '#1890ff' }} />
                        <span>{videoModal.camera?.name}</span>
                    </div>
                }
                open={videoModal.open}
                onCancel={() => setVideoModal({ ...videoModal, open: false })}
                footer={null}
                width="80vw"
                centered
                className="fullscreen-video-modal"
                styles={{ body: { padding: 0 } }}
                closeIcon={<CloseOutlined style={{ fontSize: '20px', color: '#fff' }} />}
            >
                {videoModal.camera && videoModal.camera.streamUrl ? (
                    <video
                        ref={videoRef}
                        controls
                        muted
                        autoPlay
                        style={{ width: '100%', height: '100%', background: '#000' }}
                    />
                ) : (
                    <img
                        src={videoModal.camera?.thumbnail}
                        alt={videoModal.camera?.name}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                )}
            </Modal>
        </div>
    );
};

export default Dashboard;
