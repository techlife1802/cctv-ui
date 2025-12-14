import { Camera, NVR } from '../types';

export const mockNVRs: NVR[] = [
    {
        id: '1',
        key: '1',
        name: 'Main Road Camera 01',
        location: 'Delhi',
        ip: '192.168.1.100',
        port: '8000',
        username: 'admin',
        password: 'password123',
        status: 'online',
        type: 'Hikvision',
    },
    {
        id: '2',
        key: '2',
        name: 'Main Road Camera 02',
        location: 'Delhi',
        ip: '192.168.1.101',
        port: '8000',
        username: 'admin',
        password: 'securePass!',
        status: 'online',
        type: 'CP Plus',
    },
    {
        id: '3',
        key: '3',
        name: 'Tech Park Entrance',
        location: 'Bangalore',
        ip: '192.168.2.100',
        port: '8000',
        username: 'admin',
        password: 'password789',
        status: 'online',
        type: 'Hikvision',
    },
    {
        id: '4',
        key: '4',
        name: 'Tech Park Lobby',
        location: 'Bangalore',
        ip: '192.168.2.101',
        port: '8000',
        username: 'admin',
        password: 'password999',
        status: 'offline',
        type: 'CP Plus',
    },
];

export const generateMockCameras = (count: number): Camera[] => {
    const locations = ['Delhi', 'Bangalore', 'Mumbai', 'Chennai'];
    const cameras: Camera[] = [];

    for (let i = 1; i <= count; i++) {
        const location = locations[Math.floor(Math.random() * locations.length)];
        cameras.push({
            id: i,
            name: `${location} Cam ${i.toString().padStart(3, '0')}`,
            location: location,
            status: Math.random() > 0.1 ? 'online' : 'offline', // 90% online
            thumbnail: `https://picsum.photos/400/225?random=${i}`, // Random placeholder
            nvr: `${location} NVR ${Math.ceil(i / 16)}`,
        });
    }
    return cameras;
};

export const mockCameras = generateMockCameras(120);
