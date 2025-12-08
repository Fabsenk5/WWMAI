import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import { useNavigate } from 'react-router-dom';

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
        <div className="game-lobby">
            <h1>Wer wird Millionär? - Lobby</h1>
            {errorMessage && <div className="error-message">{errorMessage}</div>}
            <div>
                <h2>Neues Spiel erstellen</h2>
                <input
                    type="text"
                    placeholder="Dein Name"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                />
                <input
                    type="number"
                    placeholder="Maximale Spieleranzahl"
                    value={playerCount}
                    onChange={(e) => setPlayerCount(Number(e.target.value))}
                />
                <div className="game-mode-selector" style={{ margin: '10px 0' }}>
                    <div style={{ display: 'flex', gap: '20px' }}>
                        <label>
                            <input
                                type="radio"
                                value="cooperative"
                                checked={gameMode === 'cooperative'}
                                onChange={(e) => setGameMode(e.target.value as 'cooperative' | 'survival')}
                            />
                            Cooperative
                        </label>
                        <label>
                            <input
                                type="radio"
                                value="survival"
                                checked={gameMode === 'survival'}
                                onChange={(e) => setGameMode(e.target.value as 'cooperative' | 'survival')}
                            />
                            Survival
                        </label>
                    </div>
                    <div style={{ marginTop: '10px' }}>
                        <label>Initial Lives: </label>
                        <input
                            type="number"
                            min="1"
                            value={lives}
                            onChange={(e) => setLives(Number(e.target.value))}
                            style={{ width: '60px' }}
                        />
                    </div>
                    <button onClick={handleCreateGame}>Spiel erstellen</button>
                </div>
                <div>
                    <h2>Spiel beitreten</h2>
                    <input
                        type="text"
                        placeholder="Raumcode"
                        value={roomCode}
                        onChange={(e) => setRoomCode(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="Dein Name"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                    />
                    <button onClick={handleJoinGame}>Spiel beitreten</button>
                </div>
            </div>
        </div>
    );
};

export default GameLobby;