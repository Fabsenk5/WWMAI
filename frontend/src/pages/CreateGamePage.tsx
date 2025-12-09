import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameContext } from '../context/GameContext';
import '../styles/Forms.css';
import { API_BASE_URL } from '../config/api';

const CreateGamePage: React.FC = () => {
    const [userCount, setUserCount] = useState(2);
    const [gameMode, setGameMode] = useState('cooperative');

    const [lives, setLives] = useState(3);
    const [waitTimer, setWaitTimer] = useState(5);
    const { createGame, loading, error: contextError } = useContext(GameContext)!;
    const [localError, setLocalError] = useState<string | null>(null);
    const [roomCode, setRoomCode] = useState<string | null>(null);
    const navigate = useNavigate();

    // Topic Selection State
    const [isMixedMode, setIsMixedMode] = useState(true);
    const [availableCategories, setAvailableCategories] = useState<string[]>([]);
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [customTopics, setCustomTopics] = useState<string[]>(['', '', '', '']);

    useEffect(() => {
        // Fetch categories on mount
        fetch(`${API_BASE_URL}/api/games/categories`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setAvailableCategories(data);
                }
            })
            .catch(err => console.error('Failed to fetch categories:', err));
    }, []);

    const toggleCategory = (category: string) => {
        setSelectedCategories(prev =>
            prev.includes(category)
                ? prev.filter(c => c !== category)
                : [...prev, category]
        );
    };

    const handleCustomTopicChange = (index: number, value: string) => {
        const newTopics = [...customTopics];
        newTopics[index] = value;
        setCustomTopics(newTopics);
    };

    const handleCreateGame = async () => {
        setLocalError(null);

        let finalCategories: string[] = [];
        let finalCustomTopics: string[] = [];

        if (!isMixedMode) {
            finalCategories = selectedCategories;
            finalCustomTopics = customTopics.filter(t => t.trim() !== '');

            if (finalCategories.length === 0 && finalCustomTopics.length === 0) {
                setLocalError("Please select at least one topic or enter a custom one, or choose Mixed mode.");
                return;
            }
        }

        const result = await createGame('New Game', userCount, gameMode, lives, waitTimer, finalCategories, finalCustomTopics);

        if (typeof result === 'string') {
            setLocalError(result);
        } else {
            console.log('Game created successfully:', result);
            setRoomCode(result.roomCode);
            navigate(`/game/${result.gameId}`);
        }
    };

    return (
        <div className="form-page-container">
            <h1>Create a New Game</h1>

            <div className="form-group">
                <label>Max Players:</label>
                <input
                    type="number"
                    min="1"
                    max="10"
                    className="form-input"
                    value={userCount}
                    onChange={(e) => setUserCount(Number(e.target.value))}
                    disabled={loading}
                />
            </div>
            <div className="form-group">
                <label>Game Mode:</label>
                <select
                    className="form-select"
                    value={gameMode}
                    onChange={(e) => setGameMode(e.target.value)}
                    disabled={loading}
                >
                    <option value="cooperative">Cooperative (Team Survival)</option>
                    <option value="survival">Competitive (Classic Survival)</option>
                </select>
            </div>
            <div className="form-group">
                <label>Initial Lives:</label>
                <input
                    type="number"
                    min="1"
                    max="10"
                    className="form-input"
                    value={lives}
                    onChange={(e) => setLives(Number(e.target.value))}
                    disabled={loading}
                />
            </div>
            <div className="form-group">
                <label>Wait Timer (seconds):</label>
                <input
                    type="number"
                    min="5"
                    max="60"
                    className="form-input"
                    value={waitTimer}
                    onChange={(e) => setWaitTimer(Number(e.target.value))}
                    disabled={loading}
                />
            </div>

            <div className="form-section-divider"></div>

            <h3>Topic Selection</h3>
            <div className="form-group">
                <label className="checkbox-label">
                    <input
                        type="checkbox"
                        checked={isMixedMode}
                        onChange={(e) => setIsMixedMode(e.target.checked)}
                        disabled={loading}
                    />
                    Mixed / Standard (All Topics)
                </label>
            </div>

            {!isMixedMode && (
                <div className="topics-selection-area">
                    <div className="form-group">
                        <label>Select Existing Topics:</label>
                        <div className="categories-grid">
                            {availableCategories.map(cat => (
                                <div
                                    key={cat}
                                    className={`category-chip ${selectedCategories.includes(cat) ? 'selected' : ''}`}
                                    onClick={() => !loading && toggleCategory(cat)}
                                >
                                    {cat}
                                </div>
                            ))}
                            {availableCategories.length === 0 && <p className="text-muted">No existing categories found.</p>}
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Custom Topics (AI Generated):</label>
                        <div className="custom-topics-grid">
                            {customTopics.map((topic, index) => (
                                <input
                                    key={index}
                                    type="text"
                                    placeholder={`Custom Topic ${index + 1}`}
                                    className="form-input"
                                    value={topic}
                                    onChange={(e) => handleCustomTopicChange(index, e.target.value)}
                                    disabled={loading}
                                />
                            ))}
                        </div>
                        <p className="form-hint">AI will generate questions for these topics.</p>
                    </div>
                </div>
            )}

            <button onClick={handleCreateGame} disabled={loading} className="form-submit-btn">
                {loading ? 'Creating Game...' : 'Start Game'}
            </button>

            {/* Display local form errors or context errors */}
            {(localError || contextError) && <div className="error-message">{localError || contextError}</div>}

            {roomCode && !loading && !(localError || contextError) && (
                <div className="room-code-display">
                    <h2>Share this Room Code:</h2>
                    <p>{roomCode}</p>
                    <p className="text-secondary" style={{ fontSize: '1rem' }}>Waiting for players...</p>
                </div>
            )}
        </div>
    );
};

export default CreateGamePage;