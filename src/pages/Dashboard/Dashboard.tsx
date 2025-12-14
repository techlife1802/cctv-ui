import React, { useState, useEffect } from 'react';
import { Typography, Select, Modal, Empty, Spin } from 'antd';
import { GlobalOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { Camera } from '../../types';
import { cameraService } from '../../services/apiService';
import './Dashboard.scss';

const { Title } = Typography;
const { Option } = Select;

const Dashboard: React.FC = () => {
    const [allCameras, setAllCameras] = useState<Camera[]>([]);
    const [filteredCameras, setFilteredCameras] = useState<Camera[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<string>('All');
    const [selectedNvr, setSelectedNvr] = useState<string>('All');
    const [loading, setLoading] = useState<boolean>(true);
    const [videoModal, setVideoModal] = useState<{ open: boolean; camera: Camera | null }>({ open: false, camera: null });

    useEffect(() => {
        const fetchCameras = async () => {
            try {
                setLoading(true);
                const data = await cameraService.getAll();
                setAllCameras(data);
                setFilteredCameras(data);
            } catch (error) {
                console.error("Failed to fetch cameras", error);
            } finally {
                setLoading(false);
            }
        };

        fetchCameras();
    }, []);

    useEffect(() => {
        let result = allCameras;

        if (selectedLocation !== 'All') {
            result = result.filter(cam => cam.location === selectedLocation);
        }

        if (selectedNvr !== 'All') {
            result = result.filter(cam => cam.nvr === selectedNvr);
        }

        setFilteredCameras(result);
    }, [selectedLocation, selectedNvr, allCameras]);

    useEffect(() => {
        setSelectedNvr('All');
    }, [selectedLocation]);

    // Derived lists
    const locations = [...new Set(allCameras.map(cam => cam.location))].sort();

    const availableNvrs = [...new Set(
        (selectedLocation === 'All' ? allCameras : allCameras.filter(cam => cam.location === selectedLocation))
            .map(cam => cam.nvr)
    )].sort();

    const handleCameraClick = (camera: Camera) => {
        setVideoModal({ open: true, camera: camera });
    };

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
                    <p className="page-description">
                        {filteredCameras.length} Active Feeds
                    </p>
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
                    {locations.map(loc => (
                        <Option key={loc} value={loc}>{loc}</Option>
                    ))}
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
                    {availableNvrs.map(nvr => (
                        <Option key={nvr} value={nvr}>{nvr}</Option>
                    ))}
                </Select>
            </div>

            <div className="video-grid">
                {filteredCameras.map((camera) => (
                    <div
                        key={camera.id}
                        className="camera-card"
                        onClick={() => handleCameraClick(camera)}
                    >
                        <img
                            src={camera.thumbnail}
                            alt={camera.name}
                            loading="lazy"
                        />
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
                ))}
            </div>

            {filteredCameras.length === 0 && <Empty description="No cameras found" />}

            <Modal
                title={videoModal.camera?.name}
                open={videoModal.open}
                onCancel={() => setVideoModal({ ...videoModal, open: false })}
                footer={null}
                width="80vw"
                centered
                className="fullscreen-video-modal"
                styles={{ body: { padding: 0 } }}
            >
                {videoModal.camera && (
                    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000' }}>
                        <img
                            src={videoModal.camera.thumbnail}
                            alt={videoModal.camera.name}
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                        <div style={{
                            position: 'absolute',
                            top: 20,
                            left: 20,
                            color: 'red',
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            background: 'rgba(0,0,0,0.5)',
                            padding: '4px 12px',
                            borderRadius: 4
                        }}>
                            <div style={{ width: 8, height: 8, background: 'red', borderRadius: '50%' }}></div>
                            LIVE
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Dashboard;
