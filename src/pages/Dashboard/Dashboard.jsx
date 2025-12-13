import React, { useState, useEffect } from 'react';
import { Typography, Select, Modal, Badge, Empty } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import './Dashboard.scss';

const { Title } = Typography;
const { Option } = Select;

// Mock Data Generator
const generateCameras = (count) => {
    const locations = ['Delhi', 'Bangalore', 'Mumbai', 'Chennai'];
    const cameras = [];

    for (let i = 1; i <= count; i++) {
        const location = locations[Math.floor(Math.random() * locations.length)];
        cameras.push({
            id: i,
            name: `${location} Cam ${i.toString().padStart(3, '0')}`,
            location: location,
            status: Math.random() > 0.1 ? 'online' : 'offline', // 90% online
            thumbnail: `https://picsum.photos/400/225?random=${i}`, // Random placeholder
        });
    }
    return cameras;
};

// Generate 120 cameras
const allCameras = generateCameras(120);

// Get unique locations
const locations = [...new Set(allCameras.map(cam => cam.location))];

const Dashboard = () => {
    const [selectedLocation, setSelectedLocation] = useState('All');
    const [filteredCameras, setFilteredCameras] = useState(allCameras);
    const [videoModal, setVideoModal] = useState({ open: false, camera: null });

    useEffect(() => {
        if (selectedLocation === 'All') {
            setFilteredCameras(allCameras);
        } else {
            setFilteredCameras(allCameras.filter(cam => cam.location === selectedLocation));
        }
    }, [selectedLocation]);

    const handleCameraClick = (camera) => {
        setVideoModal({ open: true, camera: camera });
    };

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
                    defaultValue="All"
                    className="location-selector"
                    onChange={setSelectedLocation}
                    size="large"
                    suffixIcon={<GlobalOutlined />}
                >
                    <Option value="All">All Locations</Option>
                    {locations.map(loc => (
                        <Option key={loc} value={loc}>{loc}</Option>
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
