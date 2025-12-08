import React, { useState, useContext, useEffect } from 'react'; // Import useContext and useEffect
import { useNavigate } from 'react-router-dom';
import { GameContext } from '../context/GameContext'; // Import GameContext
import axios from 'axios'; // Import axios

const JoinGamePage: React.FC = () => {
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

        axios.post('/api/games/join', { roomCode, userName, userId }) // Rename playerName to userName
            .then((response) => {
                const newUserId = response.data.userId; // Get userId from backend response
                if (newUserId) {
                    localStorage.setItem('userId', newUserId); // Store userId in localStorage
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
        <div className="join-game-page">
            <h1>Join a Game</h1>
            <form onSubmit={handleJoinGame}>
                <label htmlFor="roomCode">Room Code:</label>
                <input
                    type="text"
                    id="roomCode"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())} // Standardize to uppercase
                    required
                    disabled={loading} // Disable input while loading
                />
                 <label htmlFor="userName">Your Name:</label> {/* Rename playerName to userName */}
                 <input
                     type="text"
                     id="userName"
                     value={userName}
                     onChange={(e) => setUserName(e.target.value)} // Rename playerName to userName
                     required
                     disabled={loading} // Disable input while loading
                 />
                <button type="submit" disabled={loading}>
                     {loading ? 'Joining...' : 'Join Game'}
                </button>
            </form>
             {/* Display local form errors or context errors */}
            {(localError || contextError) && <div className="error-message">{localError || contextError}</div>}
        </div>
    );
};

export default JoinGamePage;