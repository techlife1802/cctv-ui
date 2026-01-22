import React, { useMemo } from 'react';
import { Tree, Typography, Input } from 'antd';
import { GlobalOutlined, DatabaseOutlined, CameraOutlined, SearchOutlined } from '@ant-design/icons';
import { Camera } from '../../types';

const { Title } = Typography;

interface DashboardSidebarProps {
    cameras: Camera[];
    selectedCameraIds: string[];
    onSelectionChange: (selectedIds: string[]) => void;
    loading?: boolean;
    className?: string;
}

const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
    cameras,
    selectedCameraIds,
    onSelectionChange,
    loading,
    className = ''
}) => {
    const [searchValue, setSearchValue] = React.useState('');

    const treeData = useMemo(() => {
        // Group cameras by Location and then NVR
        const locations: Record<string, Record<string, Camera[]>> = {};

        cameras.forEach(cam => {
            if (!locations[cam.location]) {
                locations[cam.location] = {};
            }
            if (!locations[cam.location][cam.nvr]) {
                locations[cam.location][cam.nvr] = [];
            }
            locations[cam.location][cam.nvr].push(cam);
        });

        return Object.entries(locations).map(([locationName, nvrs]) => ({
            title: (
                <span className="sidebar-tree-node">
                    <GlobalOutlined className="node-icon location-icon" />
                    {locationName}
                </span>
            ),
            key: `loc-${locationName}`,
            children: Object.entries(nvrs).map(([nvrName, nvrCameras]) => ({
                title: (
                    <span className="sidebar-tree-node">
                        <DatabaseOutlined className="node-icon nvr-icon" />
                        {nvrName}
                    </span>
                ),
                key: `nvr-${locationName}-${nvrName}`,
                children: nvrCameras
                    .filter(cam => cam.name.toLowerCase().includes(searchValue.toLowerCase()))
                    .map(cam => ({
                        title: (
                            <span className="sidebar-tree-node camera-node">
                                <CameraOutlined className="node-icon camera-icon" />
                                {cam.name}
                            </span>
                        ),
                        key: String(cam.id),
                        isLeaf: true,
                    }))
            })).filter(nvr => nvr.children.length > 0)
        })).filter(loc => loc.children.length > 0);
    }, [cameras, searchValue]);

    const onCheck = (checkedKeysValue: any) => {
        // filter out location and nvr keys (they start with loc- or nvr-)
        const cameraIds = (checkedKeysValue as string[]).filter(key => !key.startsWith('loc-') && !key.startsWith('nvr-'));
        onSelectionChange(cameraIds);
    };

    return (
        <div className={`dashboard-sidebar ${className}`}>
            <div className="sidebar-header">
                <Title level={4} className="sidebar-title">Locations</Title>
                <Input
                    placeholder="Search cameras..."
                    prefix={<SearchOutlined />}
                    onChange={e => setSearchValue(e.target.value)}
                    className="sidebar-search"
                    allowClear
                />
            </div>
            <div className="sidebar-content">
                <Tree
                    checkable
                    onCheck={onCheck}
                    checkedKeys={selectedCameraIds}
                    treeData={treeData}
                    className="sidebar-tree"
                    blockNode
                    defaultExpandAll={false}
                />
            </div>
        </div>
    );
};

export default DashboardSidebar;
