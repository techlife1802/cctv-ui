import React, { useState, useEffect } from 'react';
import { Typography, Table, Input, Button, Modal, Form, Space, message, Select, Spin, Collapse, Tag, Row, Col, TreeSelect, Checkbox, Tree } from 'antd';
import {
    PlusOutlined,
    SearchOutlined,
    EyeInvisibleOutlined,
    EyeTwoTone,
    DeleteOutlined,
    EditOutlined,
    UserOutlined,
    VideoCameraOutlined
} from '@ant-design/icons';
import { NVR, User, OnvifCamera, Camera } from '../../types';
import { nvrService, userService, cameraService } from '../../services/apiService';
import { NVR_TYPE, USER_ROLE } from '../../constants';
import './Configuration.scss';

const { Title, Text } = Typography;

const Configuration: React.FC = () => {
    const [nvrData, setNvrData] = useState<NVR[]>([]);
    const [userData, setUserData] = useState<User[]>([]);
    const [isNvrModalOpen, setIsNvrModalOpen] = useState(false);
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [nvrSearchText, setNvrSearchText] = useState('');
    const [userSearchText, setUserSearchText] = useState('');
    const [editingNvr, setEditingNvr] = useState<NVR | null>(null);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [loadingNvrs, setLoadingNvrs] = useState(false);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [locations, setLocations] = useState<string[]>([]);
    const [nvrForm] = Form.useForm();
    const [userForm] = Form.useForm();
    const [isTesting, setIsTesting] = useState(false);
    const [discoveryModalOpen, setDiscoveryModalOpen] = useState(false);
    const [allCameras, setAllCameras] = useState<Camera[]>([]);

    const [discoveredCameras, setDiscoveredCameras] = useState<OnvifCamera[]>([]);
    const [testingNvrId, setTestingNvrId] = useState<string | null>(null);
    const [hasDiscoveryRun, setHasDiscoveryRun] = useState(false);
    const [cameraSearchText, setCameraSearchText] = useState('');
    const [treeExpandedKeys, setTreeExpandedKeys] = useState<React.Key[]>([]);

    const fetchNvrs = async () => {
        try {
            setLoadingNvrs(true);
            const nvrs = await nvrService.getAll();
            setNvrData(nvrs);
            const uniqueLocations = Array.from(new Set(nvrs.map((nvr: NVR) => nvr.location))).sort();
            setLocations(uniqueLocations);
        } catch (error) {
            message.error('Failed to load NVRs');
        } finally {
            setLoadingNvrs(false);
        }
    };

    const fetchUsers = async () => {
        try {
            setLoadingUsers(true);
            const users = await userService.getAll();
            setUserData(users);
        } catch (error) {
            message.error('Failed to load Users');
        } finally {
            setLoadingUsers(false);
        }
    };

    const fetchCameras = async () => {
        try {
            const cams = await cameraService.getAll();
            setAllCameras(cams);
        } catch (error) {
            console.error("Failed to load cameras", error);
        }
    };

    useEffect(() => {
        fetchNvrs();
        fetchUsers();
        fetchCameras();
    }, []);

    const handleNvrSave = async (values: any) => {
        try {
            // Include discovered cameras in the save payload
            // Map discovered cameras to the backend Camera entity structure
            const mappedCameras = discoveredCameras.map(cam => ({
                name: cam.name || cam.profileName,
                // Don't set streamPath here - let backend generate it from nvrId_channel
                location: values.location,
                channel: cam.channel,
                streamUri: cam.streamUri,
                profileToken: cam.profileToken,
                status: cam.status
            }));

            // Use discovered cameras count for channels, or default to 0 if none found (implies manual/invalid)
            // Only update cameras/channels if we actually have discovery results (or ran discovery and found 0)
            // This prevents wiping data on simple edits (rename etc) where discovery wasn't re-run.

            let payload = { ...values };

            if (hasDiscoveryRun) {
                payload.cameras = mappedCameras;
                payload.channels = mappedCameras.length;
            } else if (editingNvr) {
                // If editing and no new discovery, preserve existing channel count (and don't send cameras to avoid wipe)
                // Note: user might have changed other fields like name/ip, but we keep existing config
                payload.channels = editingNvr.channels;
            } else {
                // Adding new, no discovery -> 0 channels
                payload.channels = 0;
            }

            if (editingNvr) {
                const updatedNvr = { ...editingNvr, ...payload };
                await nvrService.update(updatedNvr);
                // Refresh list to get updated data
                fetchNvrs();
                message.success('NVR updated successfully');
            } else {
                await nvrService.add(payload);
                fetchNvrs();
                message.success('NVR added successfully');
            }
            resetNvrModal();
        } catch (error) {
            console.error(error);
            message.error('Operation failed');
        }
    };

    const handleUserSave = async (values: any) => {
        try {
            if (editingUser) {
                const updatedUser = { ...editingUser, ...values };
                await userService.update(updatedUser);
                setUserData(userData.map(item => item.id === editingUser.id ? { ...item, ...values } : item));
                message.success('User updated successfully');
            } else {
                const newUser = await userService.add(values);
                setUserData([...userData, newUser]);
                message.success('User added successfully');
            }
            resetUserModal();
        } catch (error) {
            message.error('Operation failed');
        }
    };

    const handleNvrEdit = (record: NVR) => {
        setEditingNvr(record);
        nvrForm.setFieldsValue(record);
        setIsNvrModalOpen(true);
    };

    const handleUserEdit = (record: User) => {
        setEditingUser(record);
        userForm.setFieldsValue(record);
        setIsUserModalOpen(true);
    };

    const handleNvrDelete = async (id: string) => {
        try {
            await nvrService.delete(id);
            setNvrData(nvrData.filter(item => item.id !== id));
            message.success('NVR deleted');
        } catch (error) {
            message.error('Failed to delete NVR');
        }
    };

    const handleUserDelete = async (id: string) => {
        try {
            await userService.delete(id);
            setUserData(userData.filter(item => item.id !== id));
            message.success('User deleted');
        } catch (error) {
            message.error('Failed to delete User');
        }
    };

    const resetNvrModal = () => {
        setIsNvrModalOpen(false);
        setEditingNvr(null);
        setDiscoveredCameras([]);
        setHasDiscoveryRun(false);
        nvrForm.resetFields();
    };

    const handleTestConnection = async () => {
        try {
            const values = await nvrForm.validateFields();
            setIsTesting(true);

            // Create a temporary NVR object for testing
            // If type is ADIVA, use XMEYE for the backend connection test
            const typeToSend = values.type === NVR_TYPE.ADIVA ? 'XMEYE' : values.type;

            const tempNvr = {
                ...values,
                type: typeToSend as any,
                id: editingNvr?.id || 'temp'
            };

            const cameras = await nvrService.testConnection(tempNvr);
            setDiscoveredCameras(cameras);
            setHasDiscoveryRun(true);
            if (cameras.length > 0) {
                message.success(`Successfully connected! Discovered ${cameras.length} cameras.`);
            } else {
                message.warning('Connected, but no cameras found via ONVIF.');
            }
        } catch (error: any) {
            console.error('Test connection error:', error);
            const errorMsg = error.response?.data?.message || error.message || 'Connection test failed. Please check credentials and ONVIF support.';
            message.error(errorMsg);
        } finally {
            setIsTesting(false);
        }
    };

    const resetUserModal = () => {
        setIsUserModalOpen(false);
        setEditingUser(null);
        setCameraSearchText('');
        setTreeExpandedKeys([]);
        userForm.resetFields();
    };

    const filteredNvrData = nvrData.filter(item =>
        item.name.toLowerCase().includes(nvrSearchText.toLowerCase()) ||
        item.location.toLowerCase().includes(nvrSearchText.toLowerCase()) ||
        item.ip.includes(nvrSearchText)
    );

    const filteredUserData = userData.filter(item =>
        item.username.toLowerCase().includes(userSearchText.toLowerCase()) ||
        item.role.toString().toLowerCase().includes(userSearchText.toLowerCase())
    );

    const nvrColumns = [
        {
            title: 'Location',
            dataIndex: 'location',
            key: 'location',
            width: 150,
            sorter: (a: NVR, b: NVR) => a.location.localeCompare(b.location),
        },
        {
            title: 'Type',
            dataIndex: 'type',
            key: 'type',
            width: 120,
            filters: [
                { text: 'Hikvision', value: 'Hikvision' },
                { text: 'CP Plus', value: 'CP Plus' },
            ],
            onFilter: (value: any, record: NVR) => record.type.indexOf(value as string) === 0,
        },
        {
            title: 'NVR Name',
            dataIndex: 'name',
            key: 'name',
            width: 150,
            sorter: (a: NVR, b: NVR) => a.name.localeCompare(b.name),
        },
        {
            title: 'Channels',
            dataIndex: 'channels',
            key: 'channels',
            width: 100,
            sorter: (a: NVR, b: NVR) => a.channels - b.channels,
        },
        {
            title: 'Static IP',
            dataIndex: 'ip',
            key: 'ip',
            width: 150,
        },
        {
            title: 'Username',
            dataIndex: 'username',
            key: 'username',
            width: 150,
        },
        {
            title: 'Password',
            dataIndex: 'password',
            key: 'password',
            width: 180,
            render: (text: string) => (
                <Input.Password
                    value={text}
                    readOnly
                    bordered={false}
                    iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
                />
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 120,
            fixed: 'right' as const,
            render: (_: any, record: NVR) => (
                <Space>
                    <Button
                        type="text"
                        icon={<EditOutlined style={{ color: '#1677ff' }} />}
                        onClick={() => handleNvrEdit(record)}
                    />
                    <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleNvrDelete(record.id)}
                    />
                </Space>
            ),
        },
    ];

    const userColumns = [
        {
            title: 'Username',
            dataIndex: 'username',
            key: 'username',
            width: 150,
            sorter: (a: User, b: User) => a.username.localeCompare(b.username),
        },
        {
            title: 'Role',
            dataIndex: 'role',
            key: 'role',
            width: 120,
            filters: [
                { text: 'ADMIN', value: 'ADMIN' },
                { text: 'USER', value: 'USER' },
            ],
            onFilter: (value: any, record: User) => record.role === value,
            render: (role: string) => (
                <Tag color={role === 'ADMIN' ? 'blue' : 'green'}>
                    {role.toUpperCase()}
                </Tag>
            ),
        },
        {
            title: 'Locations',
            dataIndex: 'locations',
            key: 'locations',
            width: 300,
            render: (locs: string[]) => (
                <>
                    {locs && locs.length > 0 ? (
                        locs.map(loc => <Tag key={loc}>{loc}</Tag>)
                    ) : (
                        <Text type="secondary">All (Admin) or None</Text>
                    )}
                </>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 120,
            render: (_: any, record: User) => (
                <Space>
                    <Button
                        type="text"
                        icon={<EditOutlined style={{ color: '#1677ff' }} />}
                        onClick={() => handleUserEdit(record)}
                    />
                    <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleUserDelete(record.id)}
                    />
                </Space>
            ),
        },
    ];

    if ((loadingNvrs && nvrData.length === 0) || (loadingUsers && userData.length === 0)) {
        return (
            <div className="page-content configuration-page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <Spin size="large" tip="Loading configuration..." />
            </div>
        );
    }

    return (
        <div className="page-content configuration-page">
            <Title level={2} className="page-title">Configuration</Title>

            <Collapse accordion className="config-collapse">
                <Collapse.Panel
                    header={
                        <Space>
                            <VideoCameraOutlined />
                            <span>NVR Devices</span>
                        </Space>
                    }
                    key="nvr"
                >
                    <div className="actions-bar">
                        <Input
                            placeholder="Search NVR by Name, Location or IP"
                            prefix={<SearchOutlined />}
                            className="search-input"
                            onChange={(e) => setNvrSearchText(e.target.value)}
                        />
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => { setEditingNvr(null); setIsNvrModalOpen(true); }}
                        >
                            Add NVR
                        </Button>
                    </div>

                    <div className="nvr-table">
                        <Table
                            rowKey="id"
                            columns={nvrColumns}
                            dataSource={filteredNvrData}
                            loading={loadingNvrs}
                            scroll={{ x: 1200 }}
                            pagination={{ pageSize: 4, showSizeChanger: false }}
                        />
                    </div>
                </Collapse.Panel>

                <Collapse.Panel
                    header={
                        <Space>
                            <UserOutlined />
                            <span>User Management</span>
                        </Space>
                    }
                    key="users"
                >
                    <div className="actions-bar">
                        <Input
                            placeholder="Search User by Username or Role"
                            prefix={<SearchOutlined />}
                            className="search-input"
                            onChange={(e) => setUserSearchText(e.target.value)}
                        />
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => { setEditingUser(null); setIsUserModalOpen(true); }}
                        >
                            Add User
                        </Button>
                    </div>

                    <div className="user-table">
                        <Table
                            rowKey="id"
                            columns={userColumns}
                            dataSource={filteredUserData}
                            loading={loadingUsers}
                            scroll={{ x: 800 }}
                            pagination={{ pageSize: 4, showSizeChanger: false }}
                        />
                    </div>
                </Collapse.Panel>
            </Collapse>

            {/* NVR Modal */}
            <Modal
                title={editingNvr ? "Edit NVR" : "Add New NVR"}
                open={isNvrModalOpen}
                onCancel={resetNvrModal}
                footer={null}
            >
                <Form
                    form={nvrForm}
                    layout="vertical"
                    onFinish={handleNvrSave}
                >
                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item
                                name="name"
                                label="NVR Name"
                                rules={[{ required: true, message: 'Please enter NVR name' }]}
                            >
                                <Input placeholder="e.g. Main Gate" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="location"
                                label="Location"
                                rules={[{ required: true, message: 'Please enter Location' }]}
                            >
                                <Input placeholder="e.g. Building A" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="type"
                                label="NVR Type"
                                rules={[{ required: true, message: 'Please select NVR Type' }]}
                            >
                                <Select placeholder="Select NVR Type">
                                    <Select.Option value={NVR_TYPE.HIKVISION}>Hikvision</Select.Option>
                                    <Select.Option value={NVR_TYPE.CP_PLUS}>CP Plus</Select.Option>
                                    <Select.Option value={NVR_TYPE.ADIVA}>ADIVA</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={10}>
                            <Form.Item
                                name="ip"
                                label="Static IP Address"
                                rules={[
                                    { required: true, message: 'Please enter IP Address' },
                                    { pattern: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/, message: 'Invalid IP address' }
                                ]}
                            >
                                <Input placeholder="192.168.1.1" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="port"
                                label="Port"
                                rules={[{ required: true, message: 'Please enter Port' }]}
                            >
                                <Input placeholder="8000" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item
                                name="username"
                                label="Username"
                                rules={[{ required: true, message: 'Please enter Username' }]}
                            >
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="password"
                                label="Password"
                                rules={[{ required: editingNvr ? false : true, message: 'Please enter Password' }]}
                            >
                                <Input.Password placeholder={editingNvr ? "Leave blank to keep current" : ""} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item label="ONVIF Settings">
                        <Row gutter={16}>
                            <Col span={8}>
                                <Form.Item
                                    name="onvifPort"
                                    label="NVR Port"
                                >
                                    <Input placeholder="8000" />
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item
                                    name="onvifUsername"
                                    label="Username"
                                >
                                    <Input placeholder="Leave blank to use RTSP username" />
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item
                                    name="onvifPassword"
                                    label="Password"
                                >
                                    <Input.Password placeholder="Leave blank to use RTSP password" />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Button
                            type="primary"
                            onClick={handleTestConnection}
                            loading={isTesting}
                            style={{ width: '100%' }}
                        >
                            Fetch Cameras & Add NVR
                        </Button>
                    </Form.Item>

                    {discoveredCameras.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                            <Title level={5}>Discovered Cameras ({discoveredCameras.length})</Title>
                            <Table
                                size="small"
                                dataSource={discoveredCameras}
                                pagination={{ pageSize: 5 }}
                                rowKey={(record) => record.profileToken || record.name}
                                columns={[
                                    { title: 'Name', dataIndex: 'name', key: 'name' },
                                    { title: 'Profile', dataIndex: 'profileName', key: 'profileName' },
                                    { title: 'Channel', dataIndex: 'channel', key: 'channel' },
                                    {
                                        title: 'Status',
                                        dataIndex: 'status',
                                        key: 'status',
                                        render: (text) => <Tag color={text === 'Online' ? 'success' : 'error'}>{text}</Tag>
                                    }
                                ]}
                            />
                        </div>
                    )}

                    <Form.Item style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', marginBottom: 0 }}>
                        <Space>
                            <Button onClick={resetNvrModal}>Cancel</Button>
                            <Button
                                type="primary"
                                htmlType="submit"
                                disabled={!hasDiscoveryRun || discoveredCameras.length === 0}
                            >
                                {editingNvr ? "Update Device" : "Add Device"}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* User Modal */}
            <Modal
                title={editingUser ? "Edit User" : "Add New User"}
                open={isUserModalOpen}
                onCancel={resetUserModal}
                footer={null}
                width={720}
            >
                <Form
                    form={userForm}
                    layout="vertical"
                    onFinish={handleUserSave}
                >
                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item
                                name="username"
                                label="Username"
                                rules={[{ required: true, message: 'Please enter username' }]}
                            >
                                <Input placeholder="e.g. atulrai" disabled={!!editingUser} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="password"
                                label="Password"
                                rules={[{ required: editingUser ? false : true, message: 'Please enter password' }]}
                            >
                                <Input.Password placeholder={editingUser ? "Leave blank to keep current" : ""} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="role"
                                label="Role"
                                initialValue={USER_ROLE.USER}
                                rules={[{ required: true, message: 'Please select role' }]}
                            >
                                <Select>
                                    <Select.Option value={USER_ROLE.ADMIN}>Admin</Select.Option>
                                    <Select.Option value={USER_ROLE.USER}>User</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={24}>
                            <Form.Item
                                name="locations"
                                label="Assigned Locations"
                                help="Select locations this user is allowed to access."
                            >
                                <Select
                                    mode="multiple"
                                    placeholder="Select locations"
                                    showSearch
                                    optionFilterProp="children"
                                    style={{ width: '100%' }}
                                >
                                    {locations.map(loc => (
                                        <Select.Option key={loc} value={loc}>{loc}</Select.Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={24}>
                            <Form.Item
                                name="assignedCameraIds"
                                label="Assigned Cameras"
                                help="Select specific cameras. If set, overrides location access for viewing."
                            >
                                {/* Custom Camera Selection UI */}
                                <div className="camera-selection-container" style={{ border: '1px solid #d9d9d9', borderRadius: '6px', padding: '12px' }}>
                                    <Input
                                        placeholder="Search cameras..."
                                        prefix={<SearchOutlined />}
                                        style={{ marginBottom: '12px' }}
                                        allowClear
                                        onChange={(e) => setCameraSearchText(e.target.value.toLowerCase())}
                                    />
                                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                        <Form.Item
                                            noStyle
                                            shouldUpdate={(prev, curr) =>
                                                prev.locations !== curr.locations ||
                                                prev.assignedCameraIds !== curr.assignedCameraIds
                                            }
                                        >
                                            {({ getFieldValue, setFieldValue }) => {
                                                const selectedLocations = getFieldValue('locations') || [];
                                                const currentSelection = getFieldValue('assignedCameraIds') || [];
                                                const isDisabled = selectedLocations.length === 0;

                                                // Build tree data structure filtered by selected locations
                                                const locationsMap: Record<string, Record<string, any[]>> = {};

                                                allCameras.forEach(cam => {
                                                    // Only include cameras from selected locations
                                                    if (selectedLocations.includes(cam.location)) {
                                                        if (!locationsMap[cam.location]) {
                                                            locationsMap[cam.location] = {};
                                                        }
                                                        if (!locationsMap[cam.location][cam.nvr]) {
                                                            locationsMap[cam.location][cam.nvr] = [];
                                                        }
                                                        locationsMap[cam.location][cam.nvr].push(cam);
                                                    }
                                                });

                                                const treeData = Object.entries(locationsMap).map(([locationName, nvrs]) => {
                                                    const nvrChildren = Object.entries(nvrs).map(([nvrName, nvrCameras]) => {
                                                        const filteredCameras = cameraSearchText
                                                            ? nvrCameras.filter((cam: any) => cam.name.toLowerCase().includes(cameraSearchText))
                                                            : nvrCameras;

                                                        if (filteredCameras.length === 0) return null;

                                                        return {
                                                            title: <span style={{ fontWeight: 600 }}>{nvrName}</span>,
                                                            key: `nvr-${locationName}-${nvrName}`,
                                                            children: filteredCameras.map((cam: any) => ({
                                                                title: cam.name,
                                                                key: String(cam.id),
                                                                isLeaf: true,
                                                            }))
                                                        };
                                                    }).filter(Boolean);

                                                    if (nvrChildren.length === 0) return null;

                                                    return {
                                                        title: <Tag color="blue">{locationName}</Tag>,
                                                        key: `loc-${locationName}`,
                                                        children: nvrChildren
                                                    };
                                                }).filter(Boolean);

                                                const onCheck = (checkedKeysValue: any) => {
                                                    const keys = Array.isArray(checkedKeysValue)
                                                        ? checkedKeysValue
                                                        : (checkedKeysValue?.checked || []);

                                                    // Filter out location and nvr keys (they start with loc- or nvr-)
                                                    const cameraIds = (keys as string[])
                                                        .filter(key => !key.startsWith('loc-') && !key.startsWith('nvr-'));

                                                    setFieldValue('assignedCameraIds', cameraIds);
                                                };

                                                const onExpand = (newExpandedKeys: React.Key[]) => {
                                                    setTreeExpandedKeys(newExpandedKeys);
                                                };

                                                // Auto-expand when searching, otherwise use manual state
                                                const expandedKeys = cameraSearchText
                                                    ? treeData.flatMap((loc: any) => [
                                                        loc.key,
                                                        ...(loc.children || []).map((nvr: any) => nvr.key)
                                                    ])
                                                    : treeExpandedKeys;

                                                return (
                                                    <div style={{
                                                        opacity: isDisabled ? 0.6 : 1,
                                                        pointerEvents: isDisabled ? 'none' : 'auto',
                                                        transition: 'all 0.3s'
                                                    }}>
                                                        {isDisabled ? (
                                                            <div style={{
                                                                textAlign: 'center',
                                                                padding: '20px',
                                                                color: '#999',
                                                                background: '#fafafa',
                                                                borderRadius: '4px'
                                                            }}>
                                                                Please select locations first to assign cameras.
                                                            </div>
                                                        ) : (
                                                            <Spin spinning={loadingNvrs}>
                                                                <Tree
                                                                    checkable
                                                                    onCheck={onCheck}
                                                                    onExpand={onExpand}
                                                                    expandedKeys={expandedKeys}
                                                                    checkedKeys={currentSelection.map(String)}
                                                                    treeData={treeData as any}
                                                                    blockNode
                                                                    autoExpandParent={!!cameraSearchText}
                                                                    style={{ fontSize: '12px' }}
                                                                />
                                                            </Spin>
                                                        )}
                                                    </div>
                                                );
                                            }}
                                        </Form.Item>
                                    </div>
                                </div>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 0 }}>
                        <Space>
                            <Button onClick={resetUserModal}>Cancel</Button>
                            <Button type="primary" htmlType="submit">
                                {editingUser ? "Update User" : "Add User"}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Discovery Results Modal */}
            <Modal
                title="ONVIF Discovery Results"
                open={discoveryModalOpen}
                onCancel={() => setDiscoveryModalOpen(false)}
                width={800}
                footer={[
                    <Button key="close" onClick={() => setDiscoveryModalOpen(false)}>
                        Close
                    </Button>
                ]}
            >
                <Table
                    size="small"
                    dataSource={discoveredCameras}
                    pagination={false}
                    rowKey="profileToken"
                    columns={[
                        { title: 'Camera Name', dataIndex: 'name', key: 'name' },
                        { title: 'Profile Name', dataIndex: 'profileName', key: 'profileName' },
                        { title: 'Channel', dataIndex: 'channel', key: 'channel' },
                        {
                            title: 'Stream URI',
                            dataIndex: 'streamUri',
                            key: 'streamUri',
                            ellipsis: true,
                            render: (text) => <Typography.Text copyable={{ text }}>{text}</Typography.Text>
                        },
                        {
                            title: 'Status',
                            dataIndex: 'status',
                            key: 'status',
                            render: (text) => (
                                <Tag color={text === 'Online' ? 'success' : 'error'}>
                                    {text}
                                </Tag>
                            )
                        }
                    ]}
                />
            </Modal>
        </div>
    );
};

export default Configuration;
