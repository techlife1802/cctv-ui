import axios from 'axios';
import { logger } from '../utils/logger';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

const client = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add token
client.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = token;
        }
        logger.debug(`API Request: ${config.method?.toUpperCase()} ${config.url}`, config.data);
        return config;
    },
    (error) => {
        logger.error('API Request Error:', error);
        return Promise.reject(error);
    }
);

// Response interceptor
client.interceptors.response.use(
    (response) => {
        logger.debug(`API Response: ${response.status} ${response.config.url}`, response.data);
        return response;
    },
    (error) => {
        if (error.response && error.response.status === 401) {
            // Handle unauthorized access (e.g., redirect to login)
            logger.warn('Unauthorized access, logging out...');
            localStorage.removeItem('token');
            // window.location.href = '/login'; // Optional: Redirect
        } else {
            logger.error(`API Error: ${error.response?.status || 'Network Error'} ${error.config?.url}`, error.response?.data || error.message);
        }
        return Promise.reject(error);
    }
);

export default client;
