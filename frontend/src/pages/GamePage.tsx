import React, { useEffect, useState, useContext, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { GameContext, Question, User } from '../context/GameContext';
import QuestionDisplay from '../components/QuestionDisplay';
import Scoreboard from '../components/Scoreboard';
import { API_BASE_URL } from '../config/api';
import io from 'socket.io-client';
import '../styles/Game.css'; // Import Game Styles

const GamePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  console.log(`[GamePage] Mounted. ID from URL: ${id}`);

  const {
    gameData,
    fetchGameData,
    submitAnswer,
    loading,
    error,
    setGameData
  } = useContext(GameContext)!;

  const [gameEnded, setGameEnded] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [answerSubmitted, setAnswerSubmitted] = useState(false);
  const [questionError, setQuestionError] = useState<string | undefined>(undefined);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const roomCode = gameData?.room_code;

  // --- Effect 1: Fetch initial game data ---
  useEffect(() => {
    if (id) fetchGameData(id);
  }, [id, fetchGameData]);

  import { API_BASE_URL } from '../config/api';

  // ... inside useEffect for socket ...
  if (roomCode && !socketRef.current) {
    const socket = io(API_BASE_URL); // Use API_BASE_URL
    socketRef.current = socket;

    // ... inside fetch calls ...
    // Example: fetch(`${API_BASE_URL}/api/games/${roomCode}/current-question${userIdParam}`)

    // applying changes to ALL fetch occurrences below:

    // --- Effect 2: Fetch current question ---
    useEffect(() => {
      const fetchCurrentQuestion = async () => {
        if (roomCode && gameData?.status === 'started') {
          try {
            const userId = localStorage.getItem('userId');
            const userIdParam = userId ? `?userId=${userId}` : '';
            const response = await fetch(`${API_BASE_URL}/api/games/${roomCode}/current-question${userIdParam}`);

            if (!response.ok) throw new Error('Failed to fetch current question');

            const questionData = await response.json();

            if (questionData.error === true && questionData.message) {
              setQuestionError(questionData.message);
              setCurrentQuestion(null);
              return;
            }

            setQuestionError(undefined);

            if (questionData && (questionData.id || questionData.question)) {
              setCurrentQuestion(questionData);
            } else if (questionData.message) {
              setQuestionError(questionData.message);
            }
          } catch (err) {
            console.error(err);
            setQuestionError('Failed to fetch current question.');
          }
        }
      };
      fetchCurrentQuestion();
    }, [roomCode, gameData?.status, gameData?.current_level]);

    // --- Effect 3: WebSocket ---
    useEffect(() => {
      if (roomCode && !socketRef.current) {
        const socket = io(API_BASE_URL);
        socketRef.current = socket;

        socket.on('connect', () => {
          const currentUserId = localStorage.getItem('userId');
          if (currentUserId && roomCode) {
            socket.emit('joinRoom', { roomCode, userId: currentUserId });
          }
        });

        socket.on('gameEnded', () => setGameEnded(true));

        socket.on('revealAnswers', (data) => {
          if (data.playerAnswers && setGameData) {
            fetch(`${API_BASE_URL}/api/games/${roomCode}/players`)
              .then(res => res.json())
              .then(players => {
                setGameData(prev => prev ? { ...prev, users: players } : prev);
              })
              .catch(console.error);
          }
        });

        // ... existing newQuestion and userJoined handlers ...
        socket.on('newQuestion', (data: Question) => {
          setCurrentQuestion(data);
          setAnswerSubmitted(false);
          setQuestionError(undefined);
          if (setGameData) {
            setGameData(prev => {
              if (!prev) return null;
              const newLevel = (data as any).level || prev.current_level;
              return {
                ...prev,
                current_level: newLevel,
                status: 'started'
              };
            });
          }
        });

        socket.on('userJoined', () => {
          fetch(`${API_BASE_URL}/api/games/${roomCode}/players`)
            .then(res => res.json())
            .then(players => {
              if (setGameData) setGameData(prev => prev ? ({ ...prev, users: players }) : prev);
            })
            .catch(console.error);
        });

        return () => {
          if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
          }
        };
      }
    }, [roomCode, setGameData]);

    // --- Effect 4: Poll ---
    useEffect(() => {
      const fetchPlayers = async () => {
        if (roomCode) {
          try {
            const response = await fetch(`${API_BASE_URL}/api/games/${roomCode}/players`);
            if (response.ok) {
              const players = await response.json();
              setGameData(prevData => {
                if (prevData && JSON.stringify(prevData.users) !== JSON.stringify(players)) {
                  return { ...prevData, users: players };
                }
                return prevData;
              });
            }
          } catch (err) {
            console.error(err);
          }
        }
      };
      let intervalId: NodeJS.Timeout | null = null;
      if (roomCode) {
        fetchPlayers();
        intervalId = setInterval(fetchPlayers, 5000);
      }
      return () => { if (intervalId) clearInterval(intervalId); };
    }, [roomCode, setGameData]);

    const handleAnswerSubmit = async (answer: string) => {
      if (currentQuestion && roomCode) {
        try {
          await submitAnswer(roomCode, currentQuestion.id.toString(), answer);
          setAnswerSubmitted(true);
          const response = await fetch(`${API_BASE_URL}/api/games/${roomCode}/players`);
          if (response.ok) {
            const players = await response.json();
            setGameData(prev => prev ? { ...prev, users: players } : prev);
          }
        } catch (error) {
          console.error('Failed to submit answer:', error);
        }
      }
    };

    const startGame = async () => {
      if (roomCode) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/games/${roomCode}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          if (response.ok) {
            const data = await response.json();
            setCurrentQuestion(data.firstQuestion);
            if (setGameData) setGameData(prev => prev ? ({ ...prev, status: 'started', current_level: 1 }) : null);
          }
        } catch (err) {
          console.error('Error starting game:', err);
        }
      }
    };

    const refreshQuestion = async () => {
      if (roomCode) {
        try {
          const userId = localStorage.getItem('userId');
          const userIdParam = userId ? `?userId=${userId}` : '';
          const response = await fetch(`${API_BASE_URL}/api/games/${roomCode}/current-question${userIdParam}`);
          if (response.ok) {
            const data = await response.json();
            if (data.error) {
              setQuestionError(data.message);
              setCurrentQuestion(null);
            } else {
              setQuestionError(undefined);
              if (data && (data.id || data.question)) setCurrentQuestion(data);
              else if (data.message) setQuestionError(data.message);
            }
          } else {
            setQuestionError('Failed to refresh question.');
          }
        } catch (err) {
          setQuestionError('Error refreshing question.');
        }
      }
    };

    if (loading) return <div className="loading-message">Loading game data...</div>;
    if (error) return <div className="error-message">Error loading game: {error}</div>;
    if (!gameData) return <div className="error-message">Game data not found.</div>;
    if (answerSubmitted) return <div className="loading-message">Answer submitted. Waiting for other players...</div>;

    return (
      <div className="game-page-container">
        <div className="game-header">
          <h1>Game Page</h1>
          <div className="game-info-item">
            <span className="game-mode-badge">
              Mode: {gameData?.game_mode === 'survival' ? '🔥 Survival' : '🤝 Cooperative'}
            </span>
            <span>Game ID: {id}</span>
          </div>
        </div>

        <div className="game-info-bar">
          <div className="game-info-item">Room Code: <strong>{roomCode}</strong></div>
          <div className="game-info-item">Current Level: <strong>{gameData?.current_level}</strong></div>
        </div>

        {gameEnded ? (
          <h2>Game Over</h2>
        ) : gameData?.status !== 'started' ? (
          <button onClick={startGame} className="button">Start Game</button>
        ) : (
          <QuestionDisplay
            question={currentQuestion}
            onSubmit={handleAnswerSubmit}
            showCorrectAnswer={true}
            errorMessage={questionError}
            onRefresh={refreshQuestion}
            isHost={true}
          />
        )}

        <Scoreboard players={gameData?.users || []} gameEnded={gameEnded} />
      </div>
    );
  };

  export default GamePage;