import { useState, useEffect } from 'react';
import axios from 'axios';

const useGame = () => {
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchQuestions = async () => {
        try {
            const response = await axios.get('/api/games/questions');
            setQuestions(response.data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchQuestions();
    }, []);

    return { questions, loading, error };
};

export default useGame;