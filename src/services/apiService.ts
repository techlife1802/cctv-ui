import client from '../api/client';
import { Camera, NVR, LoginRequest, LoginResponse, NvrGroup } from '../types';

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
    getLocations: async (): Promise<string[]> => {
        const response = await client.get('/nvrs');
        const nvrs: NVR[] = response.data;
        const locations = [...new Set(nvrs.map(nvr => nvr.location))];
        return locations.sort();
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
    },
    getGroupedStreams: async (location: string): Promise<NvrGroup[]> => {
        const response = await client.get(`/nvrs/stream?location=${location}`);
        return response.data;
    }
};

export const cameraService = {
    getAll: async (): Promise<Camera[]> => {
        const response = await client.get('/stream/list?location=All&nvrId=All');
        return response.data;
    },
    getStreams: async (location: string, nvrId: string = 'All'): Promise<Camera[]> => {
        const response = await client.get(`/stream/list?location=${location}&nvrId=${nvrId}`);
        return response.data;
    }
};
