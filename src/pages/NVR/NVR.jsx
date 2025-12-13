import React from 'react';
import { Typography } from 'antd';

const { Title } = Typography;

const NVR = () => {
    return (
        <div className="page-content">
            <Title level={2} className="page-title">NVR Management</Title>
            <p className="page-description">Network Video Recorder status and playback.</p>
        </div>
    );
};

export default NVR;
