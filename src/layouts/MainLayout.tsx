import React, { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, theme } from 'antd';
import {
    DashboardOutlined,
    VideoCameraOutlined,
    SettingOutlined,
    UserOutlined,
    LogoutOutlined
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import './MainLayout.scss';

const { Header, Sider, Content } = Layout;

const MainLayout: React.FC = () => {
    const [collapsed, setCollapsed] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const {
        token: { colorBgContainer, borderRadiusLG },
    } = theme.useToken();

    const menuItems = [
        {
            key: '/dashboard',
            icon: <DashboardOutlined />,
            label: 'Dashboard',
        },
        {
            key: '/nvr',
            icon: <VideoCameraOutlined />,
            label: 'NVR',
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
            <Sider collapsible collapsed={collapsed} onCollapse={(value) => setCollapsed(value)} theme="light">
                <div className="logo">CCTV UI</div>
                <Menu
                    theme="light"
                    mode="inline"
                    selectedKeys={[currentPath]}
                    items={menuItems}
                    onClick={handleMenuClick}
                />
            </Sider>
            <Layout>
                <Header className="site-layout-header">
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
        </Layout>
    );
};

export default MainLayout;
