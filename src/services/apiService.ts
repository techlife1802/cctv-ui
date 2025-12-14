import client from '../api/client';
import { Camera, NVR, LoginRequest, LoginResponse } from '../types';
import { mockNVRs, mockCameras } from '../data/mockData';

// Helper to simulate API delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const authService = {
    login: async (credentials: LoginRequest): Promise<LoginResponse> => {
        const response = await client.post('/auth/login', credentials);
        return response.data;
    },
};

export const nvrService = {
    getAll: async (): Promise<NVR[]> => {
        const response = await client.get('/nvrs');
        return response.data;
    },
    add: async (nvr: Omit<NVR, 'id' | 'key'>): Promise<NVR> => {
        const response = await client.post('/nvrs', nvr);
        return response.data;
    },
    update: async (nvr: NVR): Promise<NVR> => {
        const response = await client.put(`/nvrs/${nvr.id}`, nvr);
        return response.data;
    },
    delete: async (id: string): Promise<void> => {
        await client.delete(`/nvrs/${id}`);
    }
};

export const cameraService = {
    getAll: async (): Promise<Camera[]> => {
        const response = await client.get('/cameras');
        return response.data;
    }
};
