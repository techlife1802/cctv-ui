import React, { useState } from 'react';
import { Modal, Form, Input, message } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { userService } from '../../api/userService';

interface ChangePasswordModalProps {
    open: boolean;
    onCancel: () => void;
    onSuccess: () => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ open, onCancel, onSuccess }) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            setLoading(true);

            const response = await userService.changePassword({
                currentPassword: values.currentPassword,
                newPassword: values.newPassword
            });

            if (response.success) {
                message.success('Password changed successfully');
                form.resetFields();
                onSuccess();
            } else {
                message.error(response.message || 'Failed to change password');
            }
        } catch (error: any) {
            console.error('Password change error:', error);
            if (error.response && error.response.data && error.response.data.message) {
                message.error(error.response.data.message);
            } else {
                message.error('An error occurred while changing password');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            title="Change Password"
            open={open}
            onOk={handleSubmit}
            onCancel={onCancel}
            confirmLoading={loading}
            destroyOnClose
        >
            <Form
                form={form}
                layout="vertical"
                name="change_password_form"
            >
                <Form.Item
                    name="currentPassword"
                    label="Current Password"
                    rules={[{ required: true, message: 'Please input your current password!' }]}
                >
                    <Input.Password prefix={<LockOutlined />} placeholder="Current Password" />
                </Form.Item>

                <Form.Item
                    name="newPassword"
                    label="New Password"
                    rules={[
                        { required: true, message: 'Please input your new password!' },
                        { min: 6, message: 'Password must be at least 6 characters!' }
                    ]}
                >
                    <Input.Password prefix={<LockOutlined />} placeholder="New Password" />
                </Form.Item>

                <Form.Item
                    name="confirmPassword"
                    label="Confirm New Password"
                    dependencies={['newPassword']}
                    rules={[
                        { required: true, message: 'Please confirm your new password!' },
                        ({ getFieldValue }) => ({
                            validator(_, value) {
                                if (!value || getFieldValue('newPassword') === value) {
                                    return Promise.resolve();
                                }
                                return Promise.reject(new Error('The two passwords that you entered do not match!'));
                            },
                        }),
                    ]}
                >
                    <Input.Password prefix={<LockOutlined />} placeholder="Confirm New Password" />
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default ChangePasswordModal;
