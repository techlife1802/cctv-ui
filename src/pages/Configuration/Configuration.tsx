import React, { useState, useEffect } from 'react';
import { Typography, Table, Input, Button, Modal, Form, Space, message, Select, Spin } from 'antd';
import {
    PlusOutlined,
    SearchOutlined,
    EyeInvisibleOutlined,
    EyeTwoTone,
    DeleteOutlined,
    EditOutlined
} from '@ant-design/icons';
import { NVR } from '../../types';
import { nvrService } from '../../services/apiService';
import './Configuration.scss';

const { Title } = Typography;

const Configuration: React.FC = () => {
    const [data, setData] = useState<NVR[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [editingRecord, setEditingRecord] = useState<NVR | null>(null);
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();

    const fetchNvrs = async () => {
        try {
            setLoading(true);
            const nvrs = await nvrService.getAll();
            setData(nvrs);
        } catch (error) {
            message.error('Failed to load NVRs');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNvrs();
    }, []);

    const handleSave = async (values: any) => {
        try {
            if (editingRecord) {
                // Edit Logic
                const updatedNvr = { ...editingRecord, ...values };
                await nvrService.update(updatedNvr);

                const newData = data.map(item =>
                    item.id === editingRecord.id
                        ? { ...item, ...values }
                        : item
                );
                setData(newData);
                message.success('NVR updated successfully');
            } else {
                // Add Logic
                const newNvr = await nvrService.add(values);
                setData([...data, newNvr]);
                message.success('NVR added successfully');
            }
            resetModal();
        } catch (error) {
            message.error('Operation failed');
        }
    };

    const handleEdit = (record: NVR) => {
        setEditingRecord(record);
        form.setFieldsValue(record);
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await nvrService.delete(id);
            setData(data.filter(item => item.id !== id));
            message.success('NVR deleted');
        } catch (error) {
            message.error('Failed to delete NVR');
        }
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
            onFilter: (value: boolean | React.Key, record: NVR) => record.type.indexOf(value as string) === 0,
        },
        {
            title: 'NVR Name',
            dataIndex: 'name',
            key: 'name',
            sorter: (a: NVR, b: NVR) => a.name.localeCompare(b.name),
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => (
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
                        onClick={() => handleEdit(record)}
                    />
                    <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(record.id)}
                    />
                </Space>
            ),
        },
    ];

    if (loading && data.length === 0) {
        return (
            <div className="page-content configuration-page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Spin size="large" />
            </div>
        );
    }

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
                <Table rowKey="id" columns={columns} dataSource={filteredData} />
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
                        name="type"
                        label="NVR Type"
                        rules={[{ required: true, message: 'Please select NVR Type' }]}
                    >
                        <Select placeholder="Select NVR Type">
                            <Select.Option value="Hikvision">Hikvision</Select.Option>
                            <Select.Option value="CP Plus">CP Plus</Select.Option>
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
                        rules={[{ required: true, message: 'Please enter Password' }]}
                    >
                        <Input.Password />
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
