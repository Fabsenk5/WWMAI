import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import { useNavigate } from 'react-router-dom';
import '../styles/Forms.css';

const GameLobby: React.FC = () => {
    const { createGame, joinGame } = useGame();
    const [roomCode, setRoomCode] = useState('');
    const [playerName, setPlayerName] = useState('');
    const [playerCount, setPlayerCount] = useState(1);
    const [gameMode, setGameMode] = useState<'cooperative' | 'survival'>('cooperative');
    const [lives, setLives] = useState(3);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const navigate = useNavigate();

    const handleCreateGame = async () => {
        const result = await createGame('New Game', 4, gameMode, lives);
        if (typeof result === 'string') {
            setErrorMessage(result);
        } else {
            setErrorMessage(null);
            // Result is { gameId, roomCode }
            navigate(`/lobby/${result.roomCode}`);
        }
    };

    const handleJoinGame = async () => {
        const error = await joinGame(roomCode, playerName);
        if (error) {
            setErrorMessage(error);
        } else {
            setErrorMessage(null);
            navigate(`/lobby/${roomCode}`);
        }
    };

    return (
        <div className="form-page-container">
            <h1>Wer wird Millionär? - Lobby</h1>
            {errorMessage && <div className="error-message">{errorMessage}</div>}

            <div className="list-item-bordered" style={{ marginBottom: '40px', paddingBottom: '20px' }}>
                <h2>Neues Spiel erstellen</h2>
                <div className="form-group">
                    <input
                        className="form-input"
                        type="text"
                        placeholder="Dein Name"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                    />
                </div>
                <div className="form-group">
                    <input
                        className="form-input"
                        type="number"
                        placeholder="Maximale Spieleranzahl"
                        value={playerCount}
                        onChange={(e) => setPlayerCount(Number(e.target.value))}
                    />
                </div>
                <div className="form-group">
                    <label>Game Mode:</label>
                    <select
                        className="form-select"
                        value={gameMode}
                        onChange={(e) => setGameMode(e.target.value as 'cooperative' | 'survival')}
                    >
                        <option value="cooperative">Cooperative</option>
                        <option value="survival">Survival</option>
                    </select>
                </div>
                <div className="form-group">
                    <label>Initial Lives: </label>
                    <input
                        className="form-input"
                        type="number"
                        min="1"
                        value={lives}
                        onChange={(e) => setLives(Number(e.target.value))}
                    />
                </div>
                <button className="form-submit-btn" onClick={handleCreateGame}>Spiel erstellen</button>
            </div>

            <div>
                <h2>Spiel beitreten</h2>
                <div className="form-group">
                    <input
                        className="form-input"
                        type="text"
                        placeholder="Raumcode"
                        value={roomCode}
                        onChange={(e) => setRoomCode(e.target.value)}
                    />
                </div>
                <div className="form-group">
                    <input
                        className="form-input"
                        type="text"
                        placeholder="Dein Name"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                    />
                </div>
                <button className="form-submit-btn" onClick={handleJoinGame}>Spiel beitreten</button>
            </div>
        </div>
    );
};

export default GameLobby;