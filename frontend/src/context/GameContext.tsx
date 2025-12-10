import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext'; // Import useAuth

import { API_BASE_URL } from '../config/api';

interface Question {
    id: number;
    category: string;
    difficulty: string;
    question: string;
    options: string[];
    correctAnswer: string;
    incorrect_answers?: string[]; // Add optional incorrect_answers for mapping
    prize: number; // Added prize field
    level?: number; // Added level field
}

interface User { // Rename Player to User for consistency
    userId: string; // Added userId
    name: string;
    score: number;
    lives: number;
    jokers_used?: string[]; // Added jokers_used
}

interface GameData { // Define a more specific type for gameData
    id: number;
    name: string;
    user_count: number; // Rename player_count to user_count
    created_at: string;
    room_code: string;
    users: User[]; // Rename players to users
    questions?: Question[]; // Make questions optional, as they are loaded separately
    status?: string; // Optional status field
    current_level: number;
    lives: number; // Team lives
    game_mode?: 'cooperative' | 'survival'; // Add game_mode
    jokers_used?: string[]; // Added jokers_used for team
    host_id?: string; // Added host_id
    moderator_mode?: boolean; // Added moderator_mode
}

// Added currentQuestion to GameContextType
interface GameContextType {
    questions: Question[];
    currentQuestionIndex: number;
    score: number;
    fetchQuestions: () => Promise<void>;
    nextQuestion: () => void;
    resetGame: () => void;
    createGame: (gameName: string, userCount: number, gameMode: string, lives: number, waitTimer: number, categories?: string[], customCategories?: string[], difficultyMode?: string, moderatorMode?: boolean) => Promise<{ gameId: number; roomCode: string; } | string>; // Add moderatorMode
    joinGame: (roomCode: string, userName: string) => Promise<string | void>;
    loading: boolean;
    error: string | null;
    currentQuestion: Question | null; // Added this property
    gameData: GameData | null; // Added this property
    fetchGameData: (id: string) => Promise<void>; // Added this property
    submitAnswer: (gameId: string, questionId: string, answer: string) => Promise<void>; // Added this property
    setGameData: React.Dispatch<React.SetStateAction<GameData | null>>; // Add setGameData to the context type
}

export interface GameContextProps {
    gameData: GameData | null;
    loading: boolean;
    error: string | null;
    currentQuestionIndex: number; // Add state for current question index
    currentQuestion: Question | null; // Derived state for the current question
    fetchGameData: (id: string) => Promise<void>;
    submitAnswer: (gameId: string, questionId: string, answer: string) => Promise<void>;
    nextQuestion: () => void; // Keep or remove based on final logic
}

const GameContext = createContext<GameContextType | undefined>(undefined);

// Remove BASE_URL, use relative paths for proxy
// const BASE_URL = 'http://localhost:5000';

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { token } = useAuth(); // Get token from AuthContext
    const [questions, setQuestions] = useState<Question[]>([]); // Consider removing if using gameData.questions
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [score, setScore] = useState(0); // Consider moving player-specific state
    const [gameData, setGameData] = useState<GameData | null>(null);
    const [loading, setLoading] = useState<boolean>(false); // Initialize loading state
    const [error, setError] = useState<string | null>(null); // Initialize error state

    // This function fetches ALL questions, not specific to a game.
    // It might be unnecessary if gameData includes the specific questions for the game.
    // Keeping it for now, but review if it's needed.
    const fetchQuestions = async () => {
        // setLoading(true); // Set loading before fetch
        // setError(null);
        try {
            const response = await fetch(`${API_BASE_URL}/api/games/questions`, { // Use centralized URL
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            const transformedData = data.map((q: any) => ({
                id: q.id,
                category: q.category,
                difficulty: q.difficulty,
                question: q.question,
                // Ensure options are generated correctly if backend doesn't provide them shuffled
                options: [q.correct_answer, ...q.incorrect_answers].sort(() => Math.random() - 0.5),
                correctAnswer: q.correct_answer,
                prize: q.prize || 0 // Handle potential missing prize from this endpoint
            }));
            setQuestions(transformedData);
        } catch (err) {
            console.error("Failed to fetch all questions:", err);
            // setError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
            // setLoading(false);
        }
    };

    const nextQuestion = useCallback(() => {
        // Check if gameData and gameData.questions exist before accessing length
        if (gameData && gameData.questions && currentQuestionIndex < gameData.questions.length - 1) {
            setCurrentQuestionIndex(prevIndex => prevIndex + 1);
        } else {
            console.log("No more questions or game ended.");
            // Potentially set game status to 'ended'
        }
    }, [gameData, currentQuestionIndex]);

    const resetGame = () => {
        setCurrentQuestionIndex(0);
        setScore(0);
        setGameData(null); // Reset game data
        setError(null); // Reset error state
        setLoading(false); // Reset loading state
    };

    // Updated createGame to return gameId and roomCode or error string
    const createGame = async (gameName: string, userCount: number, gameMode: string, lives: number, waitTimer: number, categories?: string[], customCategories?: string[], difficultyMode?: string, moderatorMode?: boolean): Promise<{ gameId: number; roomCode: string } | string> => {
        setLoading(true);
        setError(null);
        try {
            const headers: HeadersInit = {
                'Content-Type': 'application/json',
            };

            if (token) {
                headers['Authorization'] = `Bearer ${token}`; // Add Authorization header
            }

            const response = await fetch(`${API_BASE_URL}/api/games/create`, { // Use centralized URL
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ gameName, playerCount: userCount, gameMode, lives, waitTimer, categories, customCategories, difficultyMode, moderatorMode }), // Include moderatorMode
            });

            const responseData = await response.json(); // Always parse JSON

            if (!response.ok) {
                return responseData.error || `Failed to create game (status ${response.status})`;
            }
            // Return gameId and roomCode on success
            return { gameId: responseData.gameId, roomCode: responseData.roomCode };
        } catch (error) {
            console.error('Error creating game:', error);
            return 'An unexpected error occurred while creating the game';
        } finally {
            setLoading(false);
        }
    };

    // Updated joinGame
    const joinGame = async (roomCode: string, userName: string): Promise<string | void> => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE_URL}/api/games/join`, { // Use centralized URL
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ roomCode, userName }), // Rename playerName to userName
            });

            const responseData = await response.json(); // Always parse JSON

            if (!response.ok) {
                return responseData.error || `Failed to join game (status ${response.status})`;
            }
            // No return needed on success, navigation handled in component
        } catch (error) {
            console.error('Error joining game:', error);
            return 'An unexpected error occurred while joining the game';
        } finally {
            setLoading(false);
        }
    };

    // Updated fetchGameData with loading and error states
    const fetchGameData = useCallback(async (id: string) => {
        console.log(`[GameContext] fetchGameData called with ID: ${id}`); // Log ID
        setLoading(true);
        setError(null);
        setGameData(null); // Clear previous data
        try {
            const response = await fetch(`${API_BASE_URL}/api/games/${id}`); // Use centralized URL
            console.log(`[GameContext] fetch response status for ID ${id}: ${response.status}`); // Log response status
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({})); // Try to parse error JSON
                const errorMessage = errorData.error || `Failed to fetch game data (status ${response.status})`;
                console.error(`[GameContext] fetch failed for ID ${id}:`, errorMessage); // Log fetch failure
                throw new Error(errorMessage);
            }
            // Explicitly type the fetched data before processing
            // Backend sends 'players', but GameData expects 'users'. We accept 'players' as any and map it.
            const rawData: any = await response.json();

            // Map players to users if present
            if (rawData.players) {
                rawData.users = rawData.players;
                // delete rawData.players; // Optional cleanup
            }

            const data: GameData & { questions: Array<Omit<Question, 'options'> & { incorrect_answers: string[] }> } = rawData;
            console.log(`[GameContext] Data received for ID ${id}:`, data); // Log received data

            // Ensure questions have options, using incorrect_answers from fetched data
            if (data.questions) {
                data.questions = data.questions.map(q => ({
                    ...q,
                    // Use q.correctAnswer and q.incorrect_answers to build options
                    options: [q.correctAnswer, ...(q.incorrect_answers || [])].sort(() => Math.random() - 0.5),
                    incorrect_answers: q.incorrect_answers || [] // Ensure incorrect_answers is always defined
                }));
            }
            console.log(`[GameContext] Setting gameData state for ID ${id}`); // Log before setting state
            setGameData(data as GameData); // Cast back to GameData after processing
            setCurrentQuestionIndex(0); // Reset index when fetching new game data
        } catch (err) {
            console.error(`[GameContext] Error in fetchGameData for ID ${id}:`, err); // Log caught error
            setError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
            console.log(`[GameContext] fetchGameData finished for ID ${id}. Setting loading to false.`); // Log finish
            setLoading(false);
        }
    }, []);

    // Derive currentQuestion based on gameData and currentQuestionIndex
    const currentQuestion = gameData?.questions?.[currentQuestionIndex] || null;

    // Updated submitAnswer
    const submitAnswer = useCallback(async (gameId: string, questionId: string, answer: string) => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.post(`${API_BASE_URL}/api/games/${gameId}/answer`, { questionId, answer });
            // Assuming the backend response includes correctness and potentially updated player scores/lives
            const { isCorrect, users } = response.data; // Rename players to users

            // Update gameData with new user scores/lives
            if (gameData && users) {
                setGameData(prevData => prevData ? { ...prevData, users: users } : null); // Rename players to users
            }

            if (isCorrect) {
                // Move to the next question if the answer is correct
                // Check if there are more questions and if gameData.questions exists
                if (gameData && gameData.questions && currentQuestionIndex < gameData.questions.length - 1) {
                    setCurrentQuestionIndex(prevIndex => prevIndex + 1);
                } else {
                    // Handle game end or no more questions scenario
                    console.log("Game finished or no more questions!");
                    // Optionally update game status in gameData if backend provides it
                }
            } else {
                // Handle incorrect answer (e.g., decrement lives if tracked)
                console.log("Incorrect answer");
            }

        } catch (err) {
            setError(axios.isAxiosError(err) ? err.message : 'Failed to submit answer');
            console.error("Answer submission error:", err);
        } finally {
            setLoading(false);
        }
    }, [gameData, currentQuestionIndex]); // Add dependencies

    return (
        <GameContext.Provider value={{
            questions, // Review if this separate state is needed
            currentQuestionIndex,
            score, // Review player-specific state
            fetchQuestions, // Review if needed
            nextQuestion,
            resetGame,
            createGame,
            joinGame,
            gameData,
            fetchGameData,
            submitAnswer, // Provide submitAnswer in the context
            loading, // Provide loading state
            error, // Provide error state
            currentQuestion, // Provide derived question
            setGameData, // Expose setGameData in the context
        }}>
            {children}
        </GameContext.Provider>
    );
};

export const useGame = () => {
    const context = useContext(GameContext);
    if (context === undefined) {
        throw new Error('useGame must be used within a GameProvider');
    }
    return context;
};

export { GameContext };
export type { Question, GameData, User }; // Rename Player to User