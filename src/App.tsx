import React from 'react';
import { ConfigProvider } from 'antd';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login/Login';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard/Dashboard';
import NVR from './pages/NVR/NVR';
import Configuration from './pages/Configuration/Configuration';
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';

import { ThemeProvider, useTheme } from './themeContext';
import { theme as antTheme } from 'antd';

const AppContent = () => {
  const { theme } = useTheme();

  return (
    <ConfigProvider
      theme={{
        algorithm: theme === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#194ca3',
          fontFamily: 'Outfit, sans-serif',
        },
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<MainLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="nvr" element={<NVR />} />
              <Route path="configuration" element={<Configuration />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
