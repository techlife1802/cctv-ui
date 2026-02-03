import React, { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, theme, Drawer, Button } from 'antd';
import {
    DashboardOutlined,
    SettingOutlined,
    UserOutlined,
    LogoutOutlined,
    BulbOutlined,
    BulbFilled,
    MenuOutlined
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../themeContext';
import './MainLayout.scss';
import logo from "../images/campus_watch_owl_logo.png";

const { Header, Content } = Layout;

const MainLayout: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { theme: currentTheme, toggleTheme } = useTheme();
    const [drawerVisible, setDrawerVisible] = useState(false);

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

    const menuItems = user?.role === 'ADMIN'
        ? [...baseMenuItems, ...adminMenuItems]
        : baseMenuItems;

    const handleMenuClick = ({ key }: { key: string }) => {
        navigate(key);
        setDrawerVisible(false);
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
                    <Button
                        className="menu-toggle-btn"
                        icon={<MenuOutlined />}
                        onClick={() => setDrawerVisible(true)}
                        type="text"
                    />
                    <div className="logo-section" onClick={() => navigate('/')}>
                        <img
                            className="logo-image"
                            src={logo}
                            alt="Logo"
                        />
                        <span className="logo-text">CAMPUS WATCH</span>
                    </div>
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
                            <span className="username">{user?.username || 'User'}</span>
                        </div>
                    </Dropdown>
                </div>
            </Header>

            <Drawer
                title="CAMPUS WATCH"
                placement="left"
                onClose={() => setDrawerVisible(false)}
                open={drawerVisible}
                bodyStyle={{ padding: 0 }}
                className={`mobile-drawer ${currentTheme}`}
            >
                <Menu
                    theme={currentTheme}
                    mode="inline"
                    selectedKeys={[currentPath]}
                    items={menuItems}
                    onClick={handleMenuClick}
                />
            </Drawer>

            <Content className="site-layout-content-wrapper">
                <Outlet />
            </Content>
        </Layout>
    );
};

export default MainLayout;
