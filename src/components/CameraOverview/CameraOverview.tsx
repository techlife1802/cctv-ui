import React, { useMemo } from 'react';
import { Card, Typography, Badge, Empty, Row, Col, Space } from 'antd';
import { Camera, CAM_STATUS } from '../../types';
import { VideoCameraOutlined, EnvironmentOutlined } from '@ant-design/icons';
import './CameraOverview.scss';

const { Title, Text } = Typography;

interface CameraOverviewProps {
    cameras: Camera[];
    onCameraSelect?: (camera: Camera) => void;
}

const CameraOverview: React.FC<CameraOverviewProps> = ({ cameras, onCameraSelect }) => {

    const camerasByLocation = useMemo(() => {
        const grouped: Record<string, Camera[]> = {};
        cameras.forEach(cam => {
            if (!grouped[cam.location]) {
                grouped[cam.location] = [];
            }
            grouped[cam.location].push(cam);
        });
        return grouped;
    }, [cameras]);

    if (!cameras || cameras.length === 0) {
        return (
            <div className="camera-overview-empty">
                <Empty description="No cameras found in the system." />
            </div>
        );
    }

    return (
        <div className="camera-overview-container">
            <div className="overview-header">
                <H3 level={2} style={{ marginBottom: 0 }}>System Overview</H3>
                <Text type="secondary">
                    Total Cameras: {cameras.length} |
                    Online: {cameras.filter(c => c.status === CAM_STATUS.ONLINE).length} |
                    Offline: {cameras.filter(c => c.status === CAM_STATUS.OFFLINE).length}
                </Text>
            </div>

            <div className="locations-grid">
                {Object.entries(camerasByLocation).sort().map(([location, locationCameras]) => (
                    <div key={location} className="location-section">
                        <div className="location-header">
                            <EnvironmentOutlined className="location-icon" />
                            <Title level={4} className="location-title">{location}</Title>
                            <Badge
                                count={locationCameras.length}
                                style={{ backgroundColor: '#1890ff' }}
                            />
                        </div>

                        <Row gutter={[16, 16]}>
                            {locationCameras.map(camera => (
                                <Col xs={24} sm={12} md={8} lg={6} xl={4} key={camera.id}>
                                    <Card
                                        hoverable
                                        className="camera-overview-card"
                                        onClick={() => onCameraSelect && onCameraSelect(camera)}
                                        size="small"
                                    >
                                        <div className="camera-card-content">
                                            <div className="camera-icon-wrapper">
                                                <VideoCameraOutlined />
                                            </div>
                                            <div className="camera-info">
                                                <Text strong ellipsis className="camera-name">{camera.name}</Text>
                                                <Text type="secondary" ellipsis className="nvr-name">{camera.nvr}</Text>
                                                <div className="status-indicator">
                                                    <Badge
                                                        status={camera.status === CAM_STATUS.ONLINE ? 'success' : 'error'}
                                                        text={camera.status}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                </Col>
                            ))}
                        </Row>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CameraOverview;
