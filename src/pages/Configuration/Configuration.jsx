import React, { useState } from 'react';
import { Typography, Table, Input, Button, Modal, Form, Space, message, Card } from 'antd';
import {
    PlusOutlined,
    SearchOutlined,
    EyeInvisibleOutlined,
    EyeTwoTone,
    DeleteOutlined,
    EditOutlined
} from '@ant-design/icons';
import './Configuration.scss';

const { Title } = Typography;

// Mock Initial Data
const initialData = [
    {
        key: '1',
        name: 'Main Road Camera 01',
        location: 'Delhi',
        ip: '192.168.1.100',
        port: '8000',
        username: 'admin',
        password: 'password123',
        status: 'online',
    },
    {
        key: '2',
        name: 'Main Road Camera 02',
        location: 'Delhi',
        ip: '192.168.1.101',
        port: '8000',
        username: 'admin',
        password: 'securePass!',
        status: 'online',
    },
    {
        key: '3',
        name: 'Tech Park Entrance',
        location: 'Bangalore',
        ip: '192.168.2.100',
        port: '8000',
        username: 'admin',
        password: 'password789',
        status: 'online',
    },
    {
        key: '4',
        name: 'Tech Park Lobby',
        location: 'Bangalore',
        ip: '192.168.2.101',
        port: '8000',
        username: 'admin',
        password: 'password999',
        status: 'offline',
    },
];

const Configuration = () => {
    const [data, setData] = useState(initialData);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [editingRecord, setEditingRecord] = useState(null);
    const [form] = Form.useForm();

    const handleSave = (values) => {
        if (editingRecord) {
            // Edit Logic
            const newData = data.map(item =>
                item.key === editingRecord.key
                    ? { ...item, ...values, status: item.status } // Keep existing status
                    : item
            );
            setData(newData);
            message.success('NVR updated successfully');
        } else {
            // Add Logic
            const newData = {
                key: Date.now().toString(),
                ...values,
                status: 'offline', // Default status for new devices
            };
            setData([...data, newData]);
            message.success('NVR added successfully');
        }
        resetModal();
    };

    const handleEdit = (record) => {
        setEditingRecord(record);
        form.setFieldsValue(record);
        setIsModalOpen(true);
    };

    const handleDelete = (key) => {
        setData(data.filter(item => item.key !== key));
        message.success('NVR deleted');
    };

    const resetModal = () => {
        setIsModalOpen(false);
        setEditingRecord(null);
        form.resetFields();
    };

    const filteredData = data.filter(item =>
        item.name.toLowerCase().includes(searchText.toLowerCase()) ||
        item.location.toLowerCase().includes(searchText.toLowerCase()) ||
        item.ip.includes(searchText)
    );

    const columns = [
        {
            title: 'Location',
            dataIndex: 'location',
            key: 'location',
            sorter: (a, b) => a.location.localeCompare(b.location),
        },
        {
            title: 'NVR Name',
            dataIndex: 'name',
            key: 'name',
            sorter: (a, b) => a.name.localeCompare(b.name),
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status) => (
                <span style={{
                    color: status === 'online' ? '#52c41a' : '#ff4d4f',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    textTransform: 'capitalize'
                }}>
                    <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: status === 'online' ? '#52c41a' : '#ff4d4f',
                        boxShadow: status === 'online' ? '0 0 0 2px rgba(82, 196, 26, 0.2)' : 'none'
                    }} />
                    {status}
                </span>
            ),
        },
        {
            title: 'Static IP',
            dataIndex: 'ip',
            key: 'ip',
        },
        {
            title: 'Port',
            dataIndex: 'port',
            key: 'port',
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
            render: (text) => (
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
            render: (_, record) => (
                <Space>
                    <Button
                        type="text"
                        icon={<EditOutlined style={{ color: '#1677ff' }} />}
                        onClick={() => handleEdit(record)}
                    />
                    <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(record.key)}
                    />
                </Space>
            ),
        },
    ];

    return (
        <div className="page-content configuration-page">
            <Title level={2} className="page-title">Configuration</Title>

            <div className="actions-bar">
                <Input
                    placeholder="Search NVR by Name, Location or IP"
                    prefix={<SearchOutlined />}
                    className="search-input"
                    onChange={(e) => setSearchText(e.target.value)}
                />
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => { setEditingRecord(null); setIsModalOpen(true); }}
                >
                    Add NVR
                </Button>
            </div>

            <div className="nvr-table">
                <Table columns={columns} dataSource={filteredData} />
            </div>

            <Modal
                title={editingRecord ? "Edit NVR" : "Add New NVR"}
                open={isModalOpen}
                onCancel={resetModal}
                footer={null}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSave}
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
                        rules={[{ required: true, message: 'Please enter Password' }]}
                    >
                        <Input.Password />
                    </Form.Item>
                    <Form.Item style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 0 }}>
                        <Space>
                            <Button onClick={resetModal}>Cancel</Button>
                            <Button type="primary" htmlType="submit">
                                {editingRecord ? "Update Device" : "Add Device"}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default Configuration;
