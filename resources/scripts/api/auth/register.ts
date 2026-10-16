import http from '@/api/http';

export interface RegisterData {
    username: string;
    email: string;
    password: string;
    passwordConfirmation: string;
    captcha?: string;
}

export default async ({ username, email, password, passwordConfirmation, captcha }: RegisterData): Promise<string> => {
    await http.get('/sanctum/csrf-cookie');
    const { data } = await http.post('/auth/register', {
        username,
        email,
        password,
        password_confirmation: passwordConfirmation,
        captcha,
    });

    return data?.data?.intended || '/';
};
