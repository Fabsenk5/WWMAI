import React, { useState, useContext } from 'react'; // Import useContext
import { useNavigate } from 'react-router-dom';
import { GameContext } from '../context/GameContext'; // Import GameContext

const CreateGamePage: React.FC = () => {
    const [userCount, setUserCount] = useState(2); // Default to 2 players
    const [gameMode, setGameMode] = useState('cooperative'); // Default mode
    const [lives, setLives] = useState(3); // Default lives
    // Use context for state management
    const { createGame, loading, error: contextError } = useContext(GameContext)!;
    const [localError, setLocalError] = useState<string | null>(null); // Local error for form validation
    const [roomCode, setRoomCode] = useState<string | null>(null); // Keep roomCode state local for display
    const navigate = useNavigate();

    const handleCreateGame = async () => {
        setLocalError(null); // Clear local error
        const result = await createGame('New Game', userCount, gameMode, lives); // Pass lives

        if (typeof result === 'string') {
            // Error occurred, context already set the error state
            setLocalError(result); // Show error locally as well
        } else {
            // Success, result contains { gameId, roomCode }
            console.log('Game created successfully:', result);
            setRoomCode(result.roomCode); // Save the room code to display it
            // Navigate to the game page using the returned gameId
            navigate(`/game/${result.gameId}`);
        }
    };

    return (
        <div className="create-game-page">
            <h1>Create a New Game</h1>

            <label>
                Max Players:
                <input
                    type="number"
                    min="1"
                    max="10"
                    value={userCount}
                    onChange={(e) => setUserCount(Number(e.target.value))}
                    disabled={loading} // Disable input while loading
                />
            </label>
            <label>
                Game Mode:
                <select
                    value={gameMode}
                    onChange={(e) => setGameMode(e.target.value)}
                    disabled={loading}
                    style={{ marginLeft: '10px', padding: '5px' }}
                >
                    <option value="cooperative">Cooperative (Team Survival)</option>
                    <option value="survival">Competitive (Classic Survival)</option>
                </select>
            </label>
            <label>
                Initial Lives:
                <input
                    type="number"
                    min="1"
                    max="10"
                    value={lives}
                    onChange={(e) => setLives(Number(e.target.value))}
                    disabled={loading}
                    style={{ marginLeft: '10px', padding: '5px', width: '60px' }}
                />
            </label>
            <button onClick={handleCreateGame} disabled={loading}>
                {loading ? 'Creating...' : 'Create Game'}
            </button>
            {/* Display local form errors or context errors */}
            {(localError || contextError) && <div className="error-message">{localError || contextError}</div>}
            {roomCode && !loading && !(localError || contextError) && ( // Show room code only on success
                <div className="room-code">
                    <h2>Share this Room Code:</h2>
                    <p>{roomCode}</p>
                    <p>Waiting for players...</p> {/* Add waiting message */}
                </div>
            )}
        </div>
    );
};

export default CreateGamePage;