import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { Typography, Select, Modal, Empty, Spin } from 'antd';
import { GlobalOutlined, VideoCameraOutlined, CloseOutlined, EyeOutlined } from '@ant-design/icons';
import { Camera } from '../../types';
import { cameraService, nvrService } from '../../services/apiService';
import CameraCard from '../../components/CameraCard';
import './Dashboard.scss';

const { Title } = Typography;
const { Option } = Select;

const Dashboard: React.FC = () => {
    const [allCameras, setAllCameras] = useState<Camera[]>([]);
    const [filteredCameras, setFilteredCameras] = useState<Camera[]>([]);
    const [locations, setLocations] = useState<string[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<string>('');
    const [selectedNvr, setSelectedNvr] = useState<string>('All');
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

                // Default to first location if available
                const defaultLocation = fetchedLocations.length > 0 ? fetchedLocations[0] : 'All';
                setSelectedLocation(defaultLocation);

                // Fetch cameras for all locations to populate dropdown options
                const allData = await cameraService.getStreams('All', 'All');
                setAllCameras(allData);

                // Fetch cameras for default location
                const defaultData = await cameraService.getStreams(defaultLocation, 'All');
                setFilteredCameras(defaultData);
            } catch (error) {
                console.error("Failed to fetch initial data", error);
            } finally {
                setLoading(false);
            }
        };
        fetchInitialData();
    }, []);

    useEffect(() => {
        const fetchFilteredStreams = async () => {
            try {
                setLoading(true);
                const streams = await cameraService.getStreams(selectedLocation, selectedNvr);
                setFilteredCameras(streams);
            } catch (error) {
                console.error("Failed to fetch streams", error);
                setFilteredCameras([]);
            } finally {
                setLoading(false);
            }
        };
        fetchFilteredStreams();
    }, [selectedLocation, selectedNvr]);

    useEffect(() => {
        setSelectedNvr('All');
    }, [selectedLocation]);


    const availableNvrs = [...new Set(
        (selectedLocation === 'All' ? allCameras : allCameras.filter(cam => cam.location === selectedLocation))
            .map(cam => cam.nvr)
    )].sort();

    const handleCameraClick = (camera: Camera) => {
        setVideoModal({ open: true, camera });
    };

    // HLS player effect
    useEffect(() => {
        if (videoModal.open && videoModal.camera?.streamUrl && videoRef.current) {
            const video = videoRef.current;
            const streamUrl = `http://localhost:8080${videoModal.camera.streamUrl}`;

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

    if (loading) {
        return (
            <div className="page-content dashboard-page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Spin size="large" />
            </div>
        );
    }

    return (
        <div className="page-content dashboard-page">
            <div className="dashboard-header">
                <div>
                    <Title level={2} className="page-title">Live Monitoring</Title>
                    <p className="page-description">{filteredCameras.length} Active Feeds</p>
                </div>

                <Select
                    value={selectedLocation}
                    className="location-selector"
                    onChange={setSelectedLocation}
                    size="large"
                    suffixIcon={<GlobalOutlined />}
                    style={{ minWidth: 200 }}
                >
                    <Option value="All">All Locations</Option>
                    {locations.map(loc => <Option key={loc} value={loc}>{loc}</Option>)}
                </Select>

                <Select
                    value={selectedNvr}
                    className="location-selector"
                    style={{ marginLeft: 16, width: 250 }}
                    onChange={setSelectedNvr}
                    size="large"
                    suffixIcon={<VideoCameraOutlined />}
                >
                    <Option value="All">All NVRs</Option>
                    {availableNvrs.map(nvr => <Option key={nvr} value={nvr}>{nvr}</Option>)}
                </Select>
            </div>

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

            {filteredCameras.length === 0 && <Empty description="No cameras found" />}

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
