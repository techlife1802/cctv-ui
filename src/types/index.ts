export interface NVR {
    id: string;
    key?: string;
    name: string;
    location: string;
    ip: string;
    port: string;
    username: string;
    password?: string;
    status: 'online' | 'offline';
    type: 'Hikvision' | 'CP Plus';
}

export interface Camera {
    id: number | string;
    name: string;
    location: string;
    nvr: string;
    status: 'online' | 'offline';
    thumbnail: string;
    streamUrl?: string; // Proxy URL for the stream
}

export interface User {
    id: string;
    username: string;
    role: 'admin' | 'user';
    token?: string;
}

export interface LoginRequest {
    username: string;
    password: string;
}

export interface LoginResponse {
    user: User;
    token: string;
}

export interface ApiResponse<T> {
    data: T;
    success: boolean;
    message?: string;
}
