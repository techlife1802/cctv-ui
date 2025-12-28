import React, { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, theme } from 'antd';
import {
    DashboardOutlined,

    SettingOutlined,
    UserOutlined,
    LogoutOutlined,
    BulbOutlined,
    BulbFilled
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../themeContext';
import './MainLayout.scss';

const { Header, Content } = Layout;

const MainLayout: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { theme: currentTheme, toggleTheme } = useTheme();

    const userJson = localStorage.getItem('user');
    const user = userJson ? JSON.parse(userJson) : null;

    const baseMenuItems = [
        {
            key: '/dashboard',
            icon: <DashboardOutlined />,
            label: 'Dashboard',
        }
    ];

    const adminMenuItems = [
        {
            key: '/configuration',
            icon: <SettingOutlined />,
            label: 'Configuration',
        },
    ];

    const menuItems = user?.role === 'admin'
        ? [...baseMenuItems, ...adminMenuItems]
        : baseMenuItems;

    const handleMenuClick = ({ key }: { key: string }) => {
        navigate(key);
    };

    const userMenu = {
        items: [
            {
                key: 'logout',
                label: 'Logout',
                icon: <LogoutOutlined />,
                onClick: () => {
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    navigate('/login');
                },
            }
        ]
    };

    const currentPath = location.pathname === '/' ? '/dashboard' : location.pathname;

    return (
        <Layout className="main-layout">
            <Header className="site-layout-header">
                <div className="header-left">
                    <div className="logo">CAMPUS WATCH</div>
                    <Menu
                        theme={currentTheme}
                        mode="horizontal"
                        selectedKeys={[currentPath]}
                        items={menuItems}
                        onClick={handleMenuClick}
                        className="top-menu"
                    />
                </div>
                <div className="header-right">
                    <div className="theme-toggle" onClick={toggleTheme}>
                        {currentTheme === 'dark' ? <BulbFilled /> : <BulbOutlined />}
                    </div>
                    <Dropdown menu={userMenu} placement="bottomRight">
                        <div className="user-info">
                            <Avatar icon={<UserOutlined />} />
                            <span>{user?.username || 'User'}</span>
                        </div>
                    </Dropdown>
                </div>
            </Header>
            <Content className="site-layout-content-wrapper">
                <Outlet />
            </Content>
        </Layout>
    );
};

export default MainLayout;
