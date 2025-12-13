import React, { useEffect, useState, useContext, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { GameContext, Question } from '../context/GameContext';
import { useModal } from '../context/ModalContext';
import { useAudio } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext'; // Added import
import QuestionDisplay from '../components/QuestionDisplay';
import Scoreboard from '../components/Scoreboard';
import { API_BASE_URL } from '../config/api';
import io from 'socket.io-client';
import '../styles/Game.css';

const GamePage: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { showAlert } = useModal();
  const { user } = useAuth(); // Added useAuth
  const { playTrack, playSFX, getAudioForLevel, stopAll } = useAudio();
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

  // Determine if the current user is the host AND moderator mode is enabled
  const userId = localStorage.getItem('userId');
  const isHostUser = gameData?.host_id === userId;
  const isModeratorMode = gameData?.moderator_mode === true; // Default to false if undefined
  const showHostView = isHostUser && isModeratorMode;

  // --- Effect 1: Fetch initial game data ---
  useEffect(() => {
    if (id) fetchGameData(id);
  }, [id, fetchGameData]);

  // --- Effect 2: Fetch current question ---
  useEffect(() => {
    const fetchCurrentQuestion = async () => {
      // Only fetch if we have a room code and the game is started
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

  // Use ref to access latest gameData inside socket callbacks without re-triggering effect
  const gameDataRef = useRef(gameData);
  useEffect(() => {
    gameDataRef.current = gameData;
  }, [gameData]);

  // --- Effect 3: WebSocket ---
  useEffect(() => {
    // Only connect if we have a roomCode and not already connected
    if (roomCode && !socketRef.current) {
      const socket = io(API_BASE_URL);
      socketRef.current = socket;

      socket.on('connect', () => {
        // Prioritize authenticated user ID, fallback to localStorage
        const effectiveUserId = user ? String(user.id) : localStorage.getItem('userId');
        if (effectiveUserId && roomCode) {
          socket.emit('joinRoom', { roomCode, userId: effectiveUserId });
        }
      });

      socket.on('gameEnded', () => setGameEnded(true));

      socket.on('revealAnswers', (data) => {
        // Audio: Win/Lose
        stopAll();
        // Use ref for current data
        const currentData = gameDataRef.current;
        const level = currentData?.current_level || 1;

        if (data.isTeamCorrect) {
          playSFX(getAudioForLevel(level, 'win'));
        } else {
          playSFX(getAudioForLevel(level, 'lose'));
        }

        if (data.playerAnswers && setGameData) {
          fetch(`${API_BASE_URL}/api/games/${roomCode}/players`)
            .then(res => res.json())
            .then(players => {
              setGameData(prev => prev ? { ...prev, users: players } : prev);
            })
            .catch(console.error);
        }
      });

      socket.on('newQuestion', (data: Question) => {
        setCurrentQuestion(data);
        setAnswerSubmitted(false);
        setQuestionError(undefined);

        // Audio: Background Loop
        const level = data.level || 1;
        playTrack(getAudioForLevel(level, 'question'), true);

        if (setGameData) {
          setGameData(prev => {
            if (!prev) return null;
            const newLevel = data.level || prev.current_level;
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

      // Cleanup on unmount or roomCode change
      return () => {
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
      };
    }
  }, [roomCode, setGameData, getAudioForLevel, playSFX, playTrack, stopAll, user]);

  // --- Effect 4: Poll for players ---
  useEffect(() => {
    const fetchPlayers = async () => {
      if (roomCode) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/games/${roomCode}/players`);
          if (response.ok) {
            const players = await response.json();
            setGameData(prevData => {
              // Only update if data changed to avoid re-renders
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
        // Audio: Final Answer
        const level = currentQuestion.level || 1;
        playSFX(getAudioForLevel(level, 'final_answer'));

        const response = await fetch(`${API_BASE_URL}/api/games/${roomCode}/players`);
        if (response.ok) {
          const players = await response.json();
          setGameData(prev => prev ? { ...prev, users: players } : prev);
        }
      } catch (error) {
        console.error('Failed to submit answer:', error);
        showAlert('Failed to submit answer', 'Error');
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
        showAlert('Error starting game', 'Error');
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


  if (loading) return <div className="loading-message">{t('loading')}</div>;
  if (error) return <div className="error-message">{t('error')}: {error}</div>;
  if (!gameData) return <div className="error-message">{t('error')}</div>;
  if (answerSubmitted) return <div className="loading-message">{t('waiting_for_players')}</div>;

  return (
    <div className="game-page-container">
      <div className="game-header">
        <h1>{t('game_page')}</h1>
        <div className="game-info-item">
          <span className="game-mode-badge">
            {t('mode')}: {gameData?.game_mode === 'survival' ? '🔥 Survival' : '🤝 Cooperative'}
          </span>
          <span>ID: {id}</span>
        </div>
      </div>

      <div className="game-info-bar">
        <div className="game-info-item">{t('room_code')}: <strong>{roomCode}</strong></div>
        <div className="game-info-item">{t('level')}: <strong>{gameData?.current_level}</strong></div>
      </div>

      {gameEnded ? (
        <h2>{t('game_over')}</h2>
      ) : gameData?.status !== 'started' ? (
        <button onClick={startGame} className="button">{t('start_game')}</button>
      ) : (
        <QuestionDisplay
          question={currentQuestion}
          onSubmit={handleAnswerSubmit}
          showCorrectAnswer={true}
          errorMessage={questionError}
          onRefresh={refreshQuestion}
          isHost={showHostView}
        />
      )}

      <Scoreboard players={gameData?.users || []} gameEnded={gameEnded} />
    </div>
  );
};

export default GamePage;