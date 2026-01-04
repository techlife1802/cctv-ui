export const APP_CONFIG = {
    DEFAULT_PORT: '554',
    DEFAULT_CHANNELS: 32,
    ALL_FILTER: 'All',
};

export const API_ENDPOINTS = {
    AUTH: '/auth',
    STREAM: '/stream',
    NVR: '/nvrs',
    USER: '/users',
};

export enum CAM_STATUS {
    ONLINE = 'online',
    OFFLINE = 'offline',
}

export enum NVR_TYPE {
    HIKVISION = 'Hikvision',
    CP_PLUS = 'CP Plus',
}

export enum USER_ROLE {
    ADMIN = 'ADMIN',
    USER = 'USER',
}
