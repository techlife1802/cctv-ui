import client from '../api/client';
import { Camera, NVR, LoginRequest, LoginResponse, NvrGroup, User, StreamInfo } from '../types';
import { API_ENDPOINTS, APP_CONFIG } from '../constants';

export const authService = {
    login: async (credentials: LoginRequest): Promise<LoginResponse> => {
        const response = await client.post(`${API_ENDPOINTS.AUTH}/login`, credentials);
        return response.data;
    },
};

export const nvrService = {
    getAll: async (): Promise<NVR[]> => {
        const response = await client.get(API_ENDPOINTS.NVR);
        return response.data;
    },
    getLocations: async (): Promise<string[]> => {
        const response = await client.get(API_ENDPOINTS.NVR);
        const nvrs: NVR[] = response.data;
        const locations = [...new Set(nvrs.map(nvr => nvr.location))];
        return locations.sort();
    },
    add: async (nvr: Omit<NVR, 'id' | 'key'>): Promise<NVR> => {
        const response = await client.post(API_ENDPOINTS.NVR, nvr);
        return response.data;
    },
    update: async (nvr: NVR): Promise<NVR> => {
        const response = await client.put(`${API_ENDPOINTS.NVR}/${nvr.id}`, nvr);
        return response.data;
    },
    delete: async (id: string): Promise<void> => {
        await client.delete(`${API_ENDPOINTS.NVR}/${id}`);
    },
    getGroupedStreams: async (location: string): Promise<NvrGroup[]> => {
        const response = await client.get(`${API_ENDPOINTS.NVR}/stream?location=${location}`);
        return response.data;
    }
};

export const cameraService = {
    getAll: async (): Promise<Camera[]> => {
        const response = await client.get(`${API_ENDPOINTS.STREAM}/list?location=${APP_CONFIG.ALL_FILTER}&nvrId=${APP_CONFIG.ALL_FILTER}`);
        return response.data;
    },
    getStreams: async (location: string, nvrId: string = APP_CONFIG.ALL_FILTER): Promise<Camera[]> => {
        const response = await client.get(`${API_ENDPOINTS.STREAM}/list?location=${location}&nvrId=${nvrId}`);
        return response.data;
    }
};

export const streamService = {
    getStreamInfo: async (nvrId: string, channelId: number): Promise<StreamInfo> => {
        const response = await client.get(`${API_ENDPOINTS.STREAM}/${nvrId}/${channelId}/info`);
        return response.data;
    }
};

export const userService = {
    getAll: async (): Promise<User[]> => {
        const response = await client.get(API_ENDPOINTS.USER);
        return response.data;
    },
    add: async (user: Omit<User, 'id'>): Promise<User> => {
        const response = await client.post(API_ENDPOINTS.USER, user);
        return response.data;
    },
    update: async (user: User): Promise<User> => {
        const response = await client.put(`${API_ENDPOINTS.USER}/${user.id}`, user);
        return response.data;
    },
    delete: async (id: string): Promise<void> => {
        await client.delete(`${API_ENDPOINTS.USER}/${id}`);
    }
};
