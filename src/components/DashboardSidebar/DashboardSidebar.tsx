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
    const [expandedKeys, setExpandedKeys] = React.useState<React.Key[]>([]);
    const [autoExpandParent, setAutoExpandParent] = React.useState(true);

    // Update expanded keys when search changes
    React.useEffect(() => {
        if (searchValue) {
            const keys: React.Key[] = [];
            cameras.forEach(cam => {
                if (cam.name.toLowerCase().includes(searchValue.toLowerCase())) {
                    keys.push(`loc-${cam.location}`);
                    keys.push(`nvr-${cam.location}-${cam.nvr}`);
                }
            });
            setExpandedKeys([...new Set(keys)]);
            setAutoExpandParent(true);
        } else {
            setExpandedKeys([]);
            setAutoExpandParent(false);
        }
    }, [cameras, searchValue]);

    const onExpand = (newExpandedKeys: React.Key[]) => {
        setExpandedKeys(newExpandedKeys);
        setAutoExpandParent(false);
    };

    const treeData = useMemo(() => {
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

        return Object.entries(locations).map(([locationName, nvrs]) => {
            const nvrChildren = Object.entries(nvrs).map(([nvrName, nvrCameras]) => {
                const filteredCameras = nvrCameras.filter(cam =>
                    !searchValue || cam.name.toLowerCase().includes(searchValue.toLowerCase())
                );

                if (filteredCameras.length === 0) return null;

                return {
                    title: (
                        <span className="sidebar-tree-node">
                            <DatabaseOutlined className="node-icon nvr-icon" />
                            <span className="node-text" title={nvrName}>{nvrName}</span>
                        </span>
                    ),
                    key: `nvr-${locationName}-${nvrName}`,
                    children: filteredCameras.map(cam => ({
                        title: (
                            <span className="sidebar-tree-node camera-node">
                                <CameraOutlined className="node-icon camera-icon" />
                                <span className="node-text" title={cam.name}>{cam.name}</span>
                            </span>
                        ),
                        key: String(cam.id),
                        isLeaf: true,
                    }))
                };
            }).filter(Boolean); // Remove nulls

            if (nvrChildren.length === 0) return null;

            return {
                title: (
                    <span className="sidebar-tree-node">
                        <GlobalOutlined className="node-icon location-icon" />
                        <span className="node-text" title={locationName}>{locationName}</span>
                    </span>
                ),
                key: `loc-${locationName}`,
                children: nvrChildren
            };
        }).filter(Boolean);
    }, [cameras, searchValue]);

    const onCheck = (checkedKeysValue: any) => {
        // filter out location and nvr keys (they start with loc- or nvr-)
        const cameraIds = (checkedKeysValue as string[]).filter(key => !key.startsWith('loc-') && !key.startsWith('nvr-'));
        onSelectionChange(cameraIds);
    };

    return (
        <div className={`dashboard-sidebar ${className}`}>
            <div className="sidebar-header">
                <Title level={4} className="sidebar-title">CCTV Locations</Title>
                <Input
                    placeholder="Search cameras..."
                    prefix={<SearchOutlined />}
                    onChange={e => setSearchValue(e.target.value)}
                    className="sidebar-search"
                    allowClear
                    value={searchValue}
                />
            </div>
            <div className="sidebar-content">
                <Tree
                    checkable
                    onCheck={onCheck}
                    checkedKeys={selectedCameraIds}
                    treeData={treeData as any}
                    className="sidebar-tree"
                    blockNode
                    expandedKeys={expandedKeys}
                    autoExpandParent={autoExpandParent}
                    onExpand={onExpand}
                    height={500} // Enables virtual scrolling
                    itemHeight={32}
                />
            </div>
        </div>
    );
};

export default DashboardSidebar;
