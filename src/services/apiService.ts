import client from '../api/client';
import { Camera, NVR, LoginRequest, LoginResponse } from '../types';
import { mockNVRs, mockCameras } from '../data/mockData';

// Helper to simulate API delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const authService = {
    login: async (credentials: LoginRequest): Promise<LoginResponse> => {
        // Mock Login
        await delay(500);
        // Simulate Basic Auth check
        const token = window.btoa(`${credentials.username}:${credentials.password}`);

        if (credentials.username === 'admin' && credentials.password === 'admin') {
            return {
                user: { id: '1', username: 'admin', role: 'admin' },
                token: `Basic ${token}`,
            };
        }
        throw new Error('Invalid credentials');
    },
};

export const nvrService = {
    getAll: async (): Promise<NVR[]> => {
        // Mock GET /nvrs
        await delay(500);
        return [...mockNVRs];
    },
    add: async (nvr: Omit<NVR, 'id' | 'key'>): Promise<NVR> => {
        // Mock POST /nvrs
        await delay(500);
        const newNVR = { ...nvr, id: Date.now().toString(), key: Date.now().toString() };
        return newNVR;
    },
    update: async (nvr: NVR): Promise<NVR> => {
        // Mock PUT /nvrs/:id
        await delay(500);
        return nvr;
    },
    delete: async (id: string): Promise<void> => {
        // Mock DELETE /nvrs/:id
        await delay(500);
        return;
    }
};

export const cameraService = {
    getAll: async (): Promise<Camera[]> => {
        // Mock GET /cameras
        await delay(500);
        return [...mockCameras];
    }
};
