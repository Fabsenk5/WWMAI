
const API_URL = 'http://localhost:5000/api/admin';

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

export const getAllCategories = async (): Promise<string[]> => {
    const response = await fetch(`${API_URL}/categories`);
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

export const listQuestions = async (page: number = 1, limit: number = 20, category?: string, difficulty?: string): Promise<QuestionsResponse> => {
    let url = `${API_URL}/questions?page=${page}&limit=${limit}`;
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
