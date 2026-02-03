import React, { useMemo, useState } from 'react';
import { Card, Typography, Badge, Empty, Row, Col, Input, Collapse, Space } from 'antd';
import { Camera, CAM_STATUS } from '../../types';
import { VideoCameraOutlined, EnvironmentOutlined, SearchOutlined, DatabaseOutlined, RightOutlined } from '@ant-design/icons';
import './CameraOverview.scss';

const { Text } = Typography;
const { Panel } = Collapse;

interface CameraOverviewProps {
    cameras: Camera[];
    onCameraSelect?: (camera: Camera) => void;
    onCheckNvrStatus?: (nvrName: string, cameras: Camera[]) => Promise<void>;
}

const CameraOverview: React.FC<CameraOverviewProps> = ({ cameras, onCameraSelect, onCheckNvrStatus }) => {
    const [searchText, setSearchText] = useState('');
    const [expandedLocs, setExpandedLocs] = useState<string[]>([]);
    const [expandedNvrs, setExpandedNvrs] = useState<string[]>([]);
    const [checkedNvrs, setCheckedNvrs] = useState<Set<string>>(new Set());

    const filteredCameras = useMemo(() => {
        if (!searchText) return cameras;
        const lowSearch = searchText.toLowerCase();
        return cameras.filter(cam =>
            cam.name.toLowerCase().includes(lowSearch) ||
            cam.location.toLowerCase().includes(lowSearch) ||
            cam.nvr.toLowerCase().includes(lowSearch)
        );
    }, [cameras, searchText]);

    const camerasByLocationAndNvr = useMemo(() => {
        const grouped: Record<string, Record<string, Camera[]>> = {};
        filteredCameras.forEach(cam => {
            if (!grouped[cam.location]) {
                grouped[cam.location] = {};
            }
            if (!grouped[cam.location][cam.nvr]) {
                grouped[cam.location][cam.nvr] = [];
            }
            grouped[cam.location][cam.nvr].push(cam);
        });
        return grouped;
    }, [filteredCameras]);

    const handleNvrExpand = (location: string, nvr: string, nvrCameras: Camera[]) => {
        const nvrKey = `${location}-${nvr}`;
        if (!checkedNvrs.has(nvrKey) && onCheckNvrStatus) {
            onCheckNvrStatus(nvr, nvrCameras);
            setCheckedNvrs((prev: Set<string>) => new Set(Array.from(prev)).add(nvrKey));
        }
    };

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
                <div className="title-section">
                    <h4 style={{ marginBottom: 0, marginTop: 0 }}>Cameras Overview</h4>
                    <span className="stats">
                        Total: {cameras.length} |
                        Online: {cameras.filter(c => c.status === CAM_STATUS.ONLINE).length} |
                        Offline: {cameras.filter(c => c.status === CAM_STATUS.OFFLINE).length}
                    </span>
                </div>
                <Input
                    placeholder="Search cameras, locations or NVRs..."
                    prefix={<SearchOutlined />}
                    value={searchText}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchText(e.target.value)}
                    className="overview-search"
                    allowClear
                />
            </div>

            <div className="locations-collapse-wrapper">
                {Object.entries(camerasByLocationAndNvr).sort().map(([location, nvrs]) => (
                    <Collapse
                        key={location}
                        className="location-collapse"
                        activeKey={expandedLocs.includes(location) ? [location] : []}
                        onChange={(keys: string | string[]) => setExpandedLocs(Array.isArray(keys) ? keys : [keys])}
                        expandIcon={({ isActive }: { isActive?: boolean }) => <RightOutlined rotate={isActive ? 90 : 0} />}
                    >
                        <Panel
                            header={
                                <div className="location-header">
                                    <EnvironmentOutlined className="location-icon" />
                                    <h4 className="location-title">{location}</h4>
                                    <Badge
                                        count={Object.values(nvrs).reduce((acc, curr) => acc + curr.length, 0)}
                                        style={{ backgroundColor: '#1890ff', marginLeft: 8 }}
                                    />
                                </div>
                            }
                            key={location}
                        >
                            <div className="nvrs-wrapper">
                                {(Object.entries(nvrs) as [string, Camera[]][]).sort((a, b) => a[0].localeCompare(b[0])).map(([nvr, nvrCameras]) => {
                                    const nvrKey = `${location}-${nvr}`;
                                    return (
                                        <Collapse
                                            key={nvrKey}
                                            className="nvr-collapse"
                                            activeKey={expandedNvrs.includes(nvrKey) ? [nvrKey] : []}
                                            onChange={(keys: string | string[]) => {
                                                const activeKeys = Array.isArray(keys) ? keys : [keys];
                                                const isExpanding = activeKeys.includes(nvrKey);
                                                if (isExpanding) {
                                                    handleNvrExpand(location, nvr, nvrCameras);
                                                }
                                                setExpandedNvrs(activeKeys);
                                            }}
                                            expandIcon={({ isActive }: { isActive?: boolean }) => <RightOutlined rotate={isActive ? 90 : 0} />}
                                        >
                                            <Panel
                                                header={
                                                    <div className="nvr-header">
                                                        <DatabaseOutlined className="nvr-icon" />
                                                        <span className="nvr-title">{nvr}</span>
                                                        <Badge
                                                            count={nvrCameras.length}
                                                            style={{ backgroundColor: '#52c41a', marginLeft: 8 }}
                                                            size="small"
                                                        />
                                                    </div>
                                                }
                                                key={nvrKey}
                                            >
                                                <Row gutter={[16, 16]} className="camera-grid">
                                                    {nvrCameras.map((camera: Camera) => (
                                                        <Col xs={24} sm={12} md={8} lg={6} key={camera.id}>
                                                            <Card
                                                                hoverable
                                                                className={`camera-overview-card status-${camera.status}`}
                                                                onClick={() => onCameraSelect && onCameraSelect(camera)}
                                                                size="small"
                                                            >
                                                                <div className="camera-card-content">
                                                                    <div className="camera-icon-wrapper">
                                                                        <VideoCameraOutlined />
                                                                    </div>
                                                                    <div className="camera-info">
                                                                        <Text
                                                                            ellipsis={{
                                                                                tooltip: true
                                                                            }}
                                                                            className="camera-name"
                                                                        >
                                                                            {camera.name}
                                                                        </Text>
                                                                        <span className="camera-status-tag">{camera.status.toUpperCase()}</span>
                                                                    </div>
                                                                </div>
                                                            </Card>
                                                        </Col>
                                                    ))}
                                                </Row>
                                            </Panel>
                                        </Collapse>
                                    );
                                })}
                            </div>
                        </Panel>
                    </Collapse>
                ))}
            </div>
        </div>
    );
};

export default CameraOverview;
