import client from './client';

export interface ChangePasswordRequest {
    currentPassword: string;
    newPassword: string;
}

export interface ChangePasswordResponse {
    success: boolean;
    message: string;
}

export const userService = {
    changePassword: async (data: ChangePasswordRequest): Promise<ChangePasswordResponse> => {
        const response = await client.post('/users/change-password', data);
        return response.data;
    }
};
