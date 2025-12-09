
import { API_BASE_URL } from '../config/api';

const API_URL = `${API_BASE_URL}/api/admin`;

export interface Question {
    id: number;
    text: string;
    category: string;
    difficulty: string;
    correctAnswer: string;
    options: string[];
    level: number;
    prize: number;
}

export interface QuestionsResponse {
    questions: Question[];
    total: number;
    page: number;
    totalPages: number;
}

export const verifyPassword = async (password: string): Promise<boolean> => {
    const response = await fetch(`${API_URL}/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
    });
    const data = await response.json();
    return data.success;
};

export const getAllCategories = async (password: string): Promise<string[]> => {
    // Pass password as query param since it's a GET request
    const response = await fetch(`${API_URL}/categories?password=${encodeURIComponent(password)}`);
    if (!response.ok) throw new Error('Failed to fetch categories');
    return response.json();
};

export const deleteQuestionsByCategories = async (categories: string[], password: string): Promise<{ success: boolean; count: number; message: string }> => {
    const response = await fetch(`${API_URL}/categories/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories, password }),
    });
    return response.json();
};

export const listQuestions = async (password: string, page: number = 1, limit: number = 20, category?: string, difficulty?: string): Promise<QuestionsResponse> => {
    let url = `${API_URL}/questions?password=${encodeURIComponent(password)}&page=${page}&limit=${limit}`;
    if (category) url += `&category=${encodeURIComponent(category)}`;
    if (difficulty) url += `&difficulty=${encodeURIComponent(difficulty)}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch questions');
    return response.json();
};

export const deleteQuestion = async (id: number, password: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${API_URL}/questions/${id}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
    });
    return response.json();
};

export const getGlobalPremiumStatus = async (password: string): Promise<{ userUnlocked: boolean; guestUnlocked: boolean }> => {
    const response = await fetch(`${API_URL}/global-premium?password=${encodeURIComponent(password)}`);
    if (!response.ok) throw new Error('Failed to fetch global premium status');
    const data = await response.json();
    return { userUnlocked: data.userUnlocked, guestUnlocked: data.guestUnlocked };
};

export const toggleGlobalPremiumStatus = async (unlocked: boolean, password: string, type: 'user' | 'guest' = 'user'): Promise<boolean> => {
    const response = await fetch(`${API_URL}/global-premium`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unlocked, password, type }),
    });
    if (!response.ok) throw new Error('Failed to update global premium status');
    const data = await response.json();
    return data.unlocked;
};

export const getPublicGlobalPremiumStatus = async (): Promise<{ userUnlocked: boolean; guestUnlocked: boolean }> => {
    const response = await fetch(`${API_BASE_URL}/api/auth/global-settings`);
    if (!response.ok) {
        console.warn('Failed to fetch public global premium status');
        return { userUnlocked: false, guestUnlocked: false };
    }
    const data = await response.json();
    return {
        userUnlocked: data.globalPremiumUnlocked,
        guestUnlocked: data.globalGuestPremiumUnlocked
    };
};

export const grantUserPremium = async (identifier: string, type: 'email' | 'id', password: string): Promise<{ message: string; user?: any }> => {
    const body: any = { password };
    if (type === 'email') body.email = identifier;
    else body.userId = identifier;

    const response = await fetch(`${API_URL}/grant-premium`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'Failed to grant premium');
    }
    return data;
};
