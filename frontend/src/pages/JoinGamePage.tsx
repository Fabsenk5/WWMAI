import React, { useState, useContext, useEffect } from 'react'; // Import useContext and useEffect
import { useNavigate } from 'react-router-dom';
import { GameContext } from '../context/GameContext'; // Import GameContext
import axios from 'axios'; // Import axios
import '../styles/Forms.css'; // Import shared form styles

import { API_BASE_URL } from '../config/api';
import { useTranslation } from 'react-i18next';

const JoinGamePage: React.FC = () => {
    const { t } = useTranslation();
    const [roomCode, setRoomCode] = useState('');
    const [userName, setUserName] = useState(''); // Rename playerName to userName
    // Use context for state management
    const { loading, error: contextError } = useContext(GameContext)!; // Removed unused `joinGame`
    const [localError, setLocalError] = useState<string | null>(null); // Local error for form validation
    const navigate = useNavigate();

    useEffect(() => {
        const userId = localStorage.getItem('userId');
        if (userId) {
            console.log('Existing userId found in localStorage:', userId);
        } else {
            console.log('No userId found in localStorage. A new one will be generated upon joining.');
        }

        // Parse roomCode from URL
        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get('roomCode');
        if (code) {
            setRoomCode(code);
        }
    }, []);

    const handleJoinGame = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError(null); // Clear local error

        if (!roomCode.trim()) {
            setLocalError("Room Code cannot be empty.");
            return;
        }
        if (!userName.trim()) {
            setLocalError("User Name cannot be empty.");
            return;
        }

        const userId = localStorage.getItem('userId');

        axios.post(`${API_BASE_URL}/api/games/join`, { roomCode, userName, userId }) // Rename playerName to userName
            .then((response) => {
                const newUserId = response.data.userId; // Get userId from backend response
                if (newUserId) {
                    localStorage.setItem('userId', newUserId); // Store userId in localStorage
                    localStorage.setItem('userName', userName); // Store userName in localStorage
                    console.log('Storing userId in localStorage:', newUserId);
                    navigate(`/lobby/${roomCode}`); // Navigate to the lobby page
                } else {
                    console.error('Failed to retrieve userId from backend response.');
                }
            })
            .catch((error) => {
                if (error.response && error.response.status === 403) {
                    setLocalError('The room is full. Please try another room.');
                } else {
                    setLocalError('Failed to join the game. Please try again.');
                }
                // Remove unnecessary console.error to clean up the network log
            });
    };

    return (
        <div className="form-page-container">
            <h1>{t('title_join_game')}</h1>
            <form onSubmit={handleJoinGame}>
                <div className="form-group">
                    <label htmlFor="roomCode">{t('label_room_code')}</label>
                    <input
                        type="text"
                        id="roomCode"
                        className="form-input"
                        value={roomCode}
                        onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                        required
                        disabled={loading}
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="userName">{t('label_your_name')}</label>
                    <input
                        type="text"
                        id="userName"
                        className="form-input"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                        required
                        disabled={loading}
                    />
                </div>
                <button type="submit" disabled={loading} className="form-submit-btn">
                    {loading ? t('btn_joining') : t('btn_join')}
                </button>
            </form>
            {/* Display local form errors or context errors */}
            {(localError || contextError) && <div className="error-message">{localError || contextError}</div>}
        </div>
    );
};

export default JoinGamePage;