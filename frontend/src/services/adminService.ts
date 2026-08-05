
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
    is_active?: boolean;
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

export const fillCategoryPool = async (category: string, password: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${API_URL}/categories/fill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, password }),
    });
    return response.json();
};

export const runSimilarityCleanup = async (password: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${API_URL}/questions/cleanup-similar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
    });
    return response.json();
};

export const runPoolMaintenance = async (password: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${API_URL}/questions/run-maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
    });
    return response.json();
};

export const listQuestions = async (password: string, page: number = 1, limit: number = 20, category?: string, difficulty?: string, isActive?: boolean): Promise<QuestionsResponse> => {
    let url = `${API_URL}/questions?password=${encodeURIComponent(password)}&page=${page}&limit=${limit}`;
    if (category) url += `&category=${encodeURIComponent(category)}`;
    if (difficulty) url += `&difficulty=${encodeURIComponent(difficulty)}`;
    if (isActive !== undefined) url += `&isActive=${isActive}`;

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

export interface User {
    id: number;
    username: string;
    email: string;
    subscription_status: 'free' | 'premium';
    subscription_end_date: string | null;
    created_at: string;
}

export const getAllUsers = async (password: string): Promise<User[]> => {
    const response = await fetch(`${API_URL}/users?password=${encodeURIComponent(password)}`);
    if (!response.ok) throw new Error('Failed to fetch users');
    return response.json();
};

export const updateUserStatus = async (userId: number, status: 'free' | 'premium', password: string): Promise<{ success: boolean; user: User }> => {
    const response = await fetch(`${API_URL}/users/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, status, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update user status');
    return data;
};

export const deleteUser = async (userId: number, password: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${API_URL}/users/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to delete user');
    return data;
};

// Archival & Regeneration
export const updateQuestionStatus = async (id: number, isActive: boolean, password: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${API_URL}/questions/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isActive, password }),
    });
    return response.json();
};

export const updateCategoryStatus = async (category: string, isActive: boolean, password: string): Promise<{ success: boolean; count: number; message: string }> => {
    const response = await fetch(`${API_URL}/categories/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, isActive, password }),
    });
    return response.json();
};

export const updateAllQuestionsStatus = async (isActive: boolean, password: string): Promise<{ success: boolean; count: number; message: string }> => {
    const response = await fetch(`${API_URL}/questions/all-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive, password }),
    });
    return response.json();
};

export const regenerateQuestions = async (password: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${API_URL}/questions/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
    });
    return response.json();
};

export const updateQuestionDifficulty = async (id: number, difficulty: string, password: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${API_URL}/questions/${id}/difficulty`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty, password }),
    });
    return response.json();
};
