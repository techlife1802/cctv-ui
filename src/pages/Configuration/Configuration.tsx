import React, { useState, useEffect } from 'react';
import { Typography, Table, Input, Button, Modal, Form, Space, message, Select, Spin, Collapse, Tag } from 'antd';
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
import { NVR, User } from '../../types';
import { nvrService, userService } from '../../services/apiService';
import { NVR_TYPE, USER_ROLE } from '../../constants';
import './Configuration.scss';

const { Title } = Typography;

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
    const [nvrForm] = Form.useForm();
    const [userForm] = Form.useForm();

    const fetchNvrs = async () => {
        try {
            setLoadingNvrs(true);
            const nvrs = await nvrService.getAll();
            setNvrData(nvrs);
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

    useEffect(() => {
        fetchNvrs();
        fetchUsers();
    }, []);

    const handleNvrSave = async (values: any) => {
        try {
            if (editingNvr) {
                const updatedNvr = { ...editingNvr, ...values };
                await nvrService.update(updatedNvr);
                setNvrData(nvrData.map(item => item.id === editingNvr.id ? { ...item, ...values } : item));
                message.success('NVR updated successfully');
            } else {
                const newNvr = await nvrService.add(values);
                setNvrData([...nvrData, newNvr]);
                message.success('NVR added successfully');
            }
            resetNvrModal();
        } catch (error) {
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
        nvrForm.resetFields();
    };

    const resetUserModal = () => {
        setIsUserModalOpen(false);
        setEditingUser(null);
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
            sorter: (a: NVR, b: NVR) => a.location.localeCompare(b.location),
        },
        {
            title: 'Type',
            dataIndex: 'type',
            key: 'type',
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
            sorter: (a: NVR, b: NVR) => a.name.localeCompare(b.name),
        },
        {
            title: 'Channels',
            dataIndex: 'channels',
            key: 'channels',
            sorter: (a: NVR, b: NVR) => a.channels - b.channels,
        },
        {
            title: 'Static IP',
            dataIndex: 'ip',
            key: 'ip',
        },
        {
            title: 'Username',
            dataIndex: 'username',
            key: 'username',
        },
        {
            title: 'Password',
            dataIndex: 'password',
            key: 'password',
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
            sorter: (a: User, b: User) => a.username.localeCompare(b.username),
        },
        {
            title: 'Role',
            dataIndex: 'role',
            key: 'role',
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
            title: 'Actions',
            key: 'actions',
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
                    <Form.Item
                        name="name"
                        label="NVR Name"
                        rules={[{ required: true, message: 'Please enter NVR name' }]}
                    >
                        <Input placeholder="e.g. Main Gate" />
                    </Form.Item>
                    <Form.Item
                        name="location"
                        label="Location"
                        rules={[{ required: true, message: 'Please enter Location' }]}
                    >
                        <Input placeholder="e.g. Building A" />
                    </Form.Item>
                    <Form.Item
                        name="type"
                        label="NVR Type"
                        rules={[{ required: true, message: 'Please select NVR Type' }]}
                    >
                        <Select placeholder="Select NVR Type">
                            <Select.Option value={NVR_TYPE.HIKVISION}>Hikvision</Select.Option>
                            <Select.Option value={NVR_TYPE.CP_PLUS}>CP Plus</Select.Option>
                        </Select>
                    </Form.Item>
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
                    <Form.Item
                        name="port"
                        label="Port"
                        rules={[{ required: true, message: 'Please enter Port' }]}
                    >
                        <Input placeholder="8000" />
                    </Form.Item>
                    <Form.Item
                        name="username"
                        label="Username"
                        rules={[{ required: true, message: 'Please enter Username' }]}
                    >
                        <Input />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        label="Password"
                        rules={[{ required: editingNvr ? false : true, message: 'Please enter Password' }]}
                    >
                        <Input.Password placeholder={editingNvr ? "Leave blank to keep current" : ""} />
                    </Form.Item>
                    <Form.Item
                        name="channels"
                        label="Number of Channels"
                        initialValue={32}
                        rules={[{ required: true, message: 'Please enter number of channels' }]}
                    >
                        <Input type="number" min={1} max={256} />
                    </Form.Item>
                    <Form.Item style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 0 }}>
                        <Space>
                            <Button onClick={resetNvrModal}>Cancel</Button>
                            <Button type="primary" htmlType="submit">
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
            >
                <Form
                    form={userForm}
                    layout="vertical"
                    onFinish={handleUserSave}
                >
                    <Form.Item
                        name="username"
                        label="Username"
                        rules={[{ required: true, message: 'Please enter username' }]}
                    >
                        <Input placeholder="e.g. atulrai" disabled={!!editingUser} />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        label="Password"
                        rules={[{ required: editingUser ? false : true, message: 'Please enter password' }]}
                    >
                        <Input.Password placeholder={editingUser ? "Leave blank to keep current" : ""} />
                    </Form.Item>
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
        </div>
    );
};

export default Configuration;
