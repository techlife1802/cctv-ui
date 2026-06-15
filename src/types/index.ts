import { CAM_STATUS, NVR_TYPE, USER_ROLE } from '../constants';

export interface NVR {
    id: string;
    key?: string;
    name: string;
    location: string;
    ip: string;
    port: string;
    username: string;
    password?: string;
    status: CAM_STATUS;
    type: NVR_TYPE;
    channels: number;
    onvifPort?: string;
    onvifUsername?: string;
    onvifPassword?: string;
    cameras?: any[]; // Backend expects list of Camera entities
}

export interface Camera {
    id: number | string;
    name: string;
    location: string;
    nvr: string;
    status: CAM_STATUS;
    thumbnail: string;
    streamUrl?: string;
    nvrId: string;
    channelId: number;
}

export interface NvrGroup {
    nvrId: string;
    nvrName: string;
    nvrIp: string;
    nvrStatus: string;
    nvrType: string;
    cameras: Camera[];
}

export interface User {
    id: string;
    username: string;
    password?: string;
    role: USER_ROLE;
    locations?: string[];
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

export interface StreamInfo {
    webRtcUrl?: string;
    hlsUrl?: string;
    rtspUrl?: string;
    streamId: string;
    mediamtxEnabled: boolean;
    iceServers?: { urls: string | string[]; username?: string; credential?: string }[];
}

export interface OnvifCamera {
    name: string;
    profileName: string;
    channel: number;
    profileToken: string;
    streamUri: string;
    status: string;
}

export interface PlaybackSegment {
    startTime: string;   // ISO 8601 datetime string
    endTime: string;     // ISO 8601 datetime string
    duration: number;    // Duration in seconds
    url?: string;        // Direct MP4/HLS playback URL if available
    thumbnailUrl?: string;
}

export { CAM_STATUS, NVR_TYPE, USER_ROLE } from '../constants';
