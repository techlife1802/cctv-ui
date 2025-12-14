import React, { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, theme } from 'antd';
import {
    DashboardOutlined,

    SettingOutlined,
    UserOutlined,
    LogoutOutlined
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import './MainLayout.scss';

const { Header, Content } = Layout;

const MainLayout: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const menuItems = [
        {
            key: '/dashboard',
            icon: <DashboardOutlined />,
            label: 'Dashboard',
        },
        {
            key: '/configuration',
            icon: <SettingOutlined />,
            label: 'Configuration',
        },
    ];

    const handleMenuClick = ({ key }: { key: string }) => {
        navigate(key);
    };

    const userMenu = {
        items: [
            {
                key: 'logout',
                label: 'Logout',
                icon: <LogoutOutlined />,
                onClick: () => navigate('/login'),
            }
        ]
    };

    const currentPath = location.pathname === '/' ? '/dashboard' : location.pathname;

    return (
        <Layout className="main-layout">
            <Header className="site-layout-header">
                <div className="header-left">
                    <div className="logo">CCTV UI</div>
                    <Menu
                        theme="light"
                        mode="horizontal"
                        selectedKeys={[currentPath]}
                        items={menuItems}
                        onClick={handleMenuClick}
                        className="top-menu"
                    />
                </div>
                <Dropdown menu={userMenu} placement="bottomRight">
                    <div className="user-info">
                        <Avatar icon={<UserOutlined />} />
                        <span>Admin User</span>
                    </div>
                </Dropdown>
            </Header>
            <Content className="site-layout-content-wrapper">
                <Outlet />
            </Content>
        </Layout>
    );
};

export default MainLayout;
