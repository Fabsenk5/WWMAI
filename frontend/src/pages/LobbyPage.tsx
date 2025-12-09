import React, { useContext, useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GameContext, GameData, User } from '../context/GameContext';
import io, { Socket } from 'socket.io-client';
import axios from 'axios';
import './LobbyPage.css'; // Import the new CSS file
import { API_BASE_URL } from '../config/api';

interface PlayerAnswer {
  name: string;
  answer: string;
  is_correct: boolean;
}

interface RevealAnswersPayload {
  correctAnswer: string;
  playerAnswers: PlayerAnswer[];
  timeToNextQuestion: number;
  currentLevel: number;
}

interface QuestionPayload {
  id: number;
  category: string;
  difficulty: string;
  question: string;
  level: number;
  prize: number;
  options: string[];
  status?: string;
  userHasAnswered?: boolean;
  userAnswer?: string;
}

const LobbyPage: React.FC = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const context = useContext(GameContext);
  const { gameData, setGameData } = context || {};

  const [players, setPlayers] = useState<User[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionPayload | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answerSubmitted, setAnswerSubmitted] = useState(false);
  const [revealedAnswers, setRevealedAnswers] = useState<RevealAnswersPayload | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isValidRoom, setIsValidRoom] = useState<boolean | null>(null);

  const [waitingForCount, setWaitingForCount] = useState<{ count: number, total: number } | null>(null);
  const [teamAnswerInfo, setTeamAnswerInfo] = useState<{ answer: string, isCorrect: boolean } | null>(null);

  const [jokerResult, setJokerResult] = useState<{ wrongAnswersToRemove?: string[] } | null>(null);
  const [jokerModal, setJokerModal] = useState<{ title: string, content: string } | null>(null);

  const socketRef = useRef<Socket | null>(null);

  const getSafeStorage = (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('Storage access restricted', e);
      return null;
    }
  };

  const setGameDataFromContext = setGameData!;

  useEffect(() => {
    const hydrateState = async () => {
      if (!roomCode) return;
      try {
        const gameResponse = await axios.get(`${API_BASE_URL}/api/games/${roomCode}`);
        const fullGameData = gameResponse.data;
        if (fullGameData.players) {
          fullGameData.users = fullGameData.players;
        }

        setGameDataFromContext(prev => ({
          ...prev,
          ...fullGameData,
          id: fullGameData.game_id,
          status: fullGameData.status || prev?.status || 'pending'
        }));

        const userId = getSafeStorage('userId') || '';
        const qResponse = await axios.get(`${API_BASE_URL}/api/games/${roomCode}/current-question?userId=${userId}`);
        const qData = qResponse.data;

        if (qData && (qData.id || qData.question)) {
          setCurrentQuestion(qData);
          if (qData.userHasAnswered) {
            setSelectedAnswer(qData.userAnswer);
            setAnswerSubmitted(true);
          }
          setGameDataFromContext(prev => {
            const updates: Partial<GameData> = {};
            if (qData.level) updates.current_level = qData.level;
            return prev ? { ...prev, ...updates } : null;
          });
        }

        const pResponse = await axios.get(`${API_BASE_URL}/api/games/${roomCode}/players`);
        setPlayers(pResponse.data);
        setIsValidRoom(true);
      } catch (error) {
        console.error('[LobbyPage] Failed to hydrate state:', error);
        setIsValidRoom(false);
      }
    };

    if (roomCode) hydrateState();
  }, [roomCode, setGameDataFromContext]);

  useEffect(() => {
    if (!roomCode || !context) return;
    if (!socketRef.current) {
      const storedUserId = getSafeStorage('userId');
      socketRef.current = io(API_BASE_URL, {
        query: {
          roomCode,
          userId: storedUserId || `user-${Math.random().toString(36).substr(2, 9)}`
        }
      });
    }

    const socket = socketRef.current;
    const onConnect = () => {
      if (roomCode) {
        socket.emit('joinRoom', {
          roomCode,
          userId: getSafeStorage('userId'),
          playerName: getSafeStorage('userName')
        });
      }
    };

    socket.on('connect', onConnect);

    const handleNewQuestion = (question: QuestionPayload) => {
      setRevealedAnswers(null);
      setTeamAnswerInfo(null);
      setCountdown(null);
      setAnswerSubmitted(false);
      setSelectedAnswer(null);
      setWaitingForCount(null);

      if (question && question.question) {
        setCurrentQuestion(question);
        setGameDataFromContext(prev => {
          if (!prev) return null;
          const updates: Partial<GameData> = { status: 'started' };
          if (typeof question.level === 'number') updates.current_level = question.level;
          return { ...prev, ...updates };
        });
      }
    };

    const handlePlayerAnswered = (data: { count: number, total: number }) => {
      setWaitingForCount(data);
    };

    const handleGameStarted = () => {
      setGameDataFromContext(prev => prev ? { ...prev, status: 'started' } : null);
    };

    const handleRevealAnswers = (data: RevealAnswersPayload & { teamAnswer: string, isTeamCorrect: boolean, livesRemaining: number }) => {
      setRevealedAnswers(data);
      setTeamAnswerInfo({ answer: data.teamAnswer, isCorrect: data.isTeamCorrect });
      setCountdown(data.timeToNextQuestion);
      setWaitingForCount(null);
      setGameDataFromContext(prev => prev ? { ...prev, lives: data.livesRemaining } : null);

      const countdownInterval = setInterval(() => {
        setCountdown(prevTime => {
          if (prevTime === null || prevTime <= 1) {
            clearInterval(countdownInterval);
            return 0;
          }
          return prevTime - 1;
        });
      }, 1000);

      if (roomCode) {
        fetch(`${API_BASE_URL}/api/games/${roomCode}/players`)
          .then(res => res.json())
          .then(updatedPlayers => setPlayers(updatedPlayers))
          .catch(console.error);
      }
      return () => clearInterval(countdownInterval);
    };

    const handleGameEnded = (data: { message: string }) => {
      alert(data.message);
      navigate('/');
    };

    const handleUserJoined = () => {
      if (roomCode) {
        axios.get(`${API_BASE_URL}/api/games/${roomCode}/players`)
          .then(res => setPlayers(res.data))
          .catch(err => console.error('Failed to update players list:', err));
      }
    };

    const handleJokerUsed = (data: { jokerType: string, userId: string }) => {
      if (data.userId === 'TEAM') {
        setGameDataFromContext(prev => {
          if (!prev) return null;
          return { ...prev, jokers_used: [...(prev.jokers_used || []), data.jokerType] };
        });
      }
    };

    socket.on('newQuestion', handleNewQuestion);
    socket.on('playerAnswered', handlePlayerAnswered);
    socket.on('gameStarted', handleGameStarted);
    socket.on('revealAnswers', handleRevealAnswers);
    socket.on('gameEnded', handleGameEnded);
    socket.on('userJoined', handleUserJoined);
    socket.on('jokerUsed', handleJokerUsed);

    return () => {
      socket.off('connect', onConnect);
      socket.off('newQuestion', handleNewQuestion);
      socket.off('playerAnswered', handlePlayerAnswered);
      socket.off('gameStarted', handleGameStarted);
      socket.off('revealAnswers', handleRevealAnswers);
      socket.off('gameEnded', handleGameEnded);
      socket.off('userJoined', handleUserJoined);
      socket.off('jokerUsed', handleJokerUsed);
      if (socket.connected) socket.disconnect();
      socketRef.current = null;
    };
  }, [roomCode, setGameDataFromContext, navigate]);

  const handleUseJoker = async (jokerType: string) => {
    if (!roomCode || !currentQuestion) return;
    const userId = getSafeStorage('userId');
    if (!userId) return;

    try {
      const res = await axios.post(`${API_BASE_URL}/api/games/${roomCode}/joker`, { userId, jokerType });
      const data = res.data;

      setGameDataFromContext(prev => {
        if (!prev) return null;
        const isSurvival = prev.game_mode === 'survival';
        if (isSurvival) {
          const updatedUsers = prev.users.map(u => {
            if (u.userId === userId) {
              return { ...u, jokers_used: [...(u.jokers_used || []), jokerType] };
            }
            return u;
          });
          return { ...prev, users: updatedUsers };
        } else {
          return { ...prev, jokers_used: [...(prev.jokers_used || []), jokerType] };
        }
      });

      if (jokerType === '5050') {
        setJokerResult({ wrongAnswersToRemove: data.wrongAnswersToRemove });
      } else if (jokerType === 'audience') {
        const stats: Record<string, number> = data.stats;
        const content = Object.keys(stats).map(key => `${key}: ${stats[key]}%`).join('\n');
        setJokerModal({ title: 'Audience Poll Result', content });
      } else if (jokerType === 'phone') {
        setJokerModal({ title: 'Phone a Friend', content: data.message });
      }
    } catch (err) {
      console.error('Failed to use joker:', err);
      alert('Failed to use joker. It may be already used.');
    }
  };

  const handleAnswerSubmit = async () => {
    if (!selectedAnswer || !currentQuestion || !roomCode) return;
    try {
      const userId = getSafeStorage('userId');
      await axios.post(`${API_BASE_URL}/api/games/${roomCode}/answer`, {
        userId,
        answer: selectedAnswer,
        questionId: currentQuestion.id
      });
      setAnswerSubmitted(true);
    } catch (error) {
      console.error('Error submitting answer:', error);
      alert('Failed to submit answer');
    }
  };

  if (isValidRoom === null) return <div className="loading">Validating...</div>;
  if (!isValidRoom) return <div className="error">Invalid room.</div>;

  return (
    <div className="lobby-page">
      <header className="lobby-header">
        <h1>{gameData?.game_mode === 'survival' ? 'Millionaire Survival' : 'Cooperative Millionaire'}</h1>
        {gameData?.game_mode !== 'survival' && (
          <div className={`lobby-lives ${(gameData?.lives || 0) > 1 ? 'text-success' : 'text-danger'}`}>
            Team Lives: {gameData?.lives ?? 3} ❤️
          </div>
        )}
      </header>

      <div className="lobby-room-info">
        <strong>Room:</strong> {roomCode} | <strong>Level:</strong> {gameData?.current_level ?? 0}
      </div>

      {waitingForCount && !revealedAnswers && (
        <div className="waiting-message">
          Waiting for teammates... ({waitingForCount.count} / {waitingForCount.total} answered)
        </div>
      )}

      {revealedAnswers && teamAnswerInfo && (
        <div className="answers-reveal">
          <h2>Round Results</h2>
          <div className="result-message">
            {gameData?.game_mode === 'survival' ? (
              <span>See your result below!</span>
            ) : (
              <>
                Team Choice: <strong>{teamAnswerInfo.answer}</strong>
                {teamAnswerInfo.isCorrect
                  ? <span className="text-success ml-2">✅ Correct!</span>
                  : <span className="text-danger ml-2">❌ Wrong!</span>}
              </>
            )}
          </div>

          <div className="correct-answer-box">
            Correct Answer: <strong>{revealedAnswers.correctAnswer}</strong>
          </div>

          <p>Next question in {countdown}s...</p>

          <h3>Votes:</h3>
          <ul className="list-none">
            {revealedAnswers.playerAnswers.map((pa, idx) => (
              <li key={idx} className="border-bottom">
                {pa.name}: {pa.answer}
              </li>
            ))}
          </ul>
        </div>
      )}

      {currentQuestion && !revealedAnswers && (
        <div>
          {(() => {
            const myId = getSafeStorage('userId');
            const me = players.find(p => p.userId === myId) || players.find(p => p.name === getSafeStorage('userName'));
            const isSurvival = gameData?.game_mode === 'survival';
            const myUsedJokers = isSurvival ? (me?.jokers_used || []) : (gameData?.jokers_used || []);
            const isAlive = isSurvival ? (me ? me.lives > 0 : true) : ((gameData?.lives ?? 0) > 0);

            if (!isAlive || answerSubmitted) return null;

            const jokers = [
              { type: '5050', label: '50:50', icon: '🌗' },
              { type: 'audience', label: 'Audience', icon: '👥' },
              { type: 'phone', label: 'Phone', icon: '📞' }
            ];

            return (
              <div className="joker-container">
                {jokers.map(joker => {
                  const isUsed = myUsedJokers.includes(joker.type);
                  return (
                    <button
                      key={joker.type}
                      onClick={() => handleUseJoker(joker.type)}
                      disabled={isUsed || !!jokerResult?.wrongAnswersToRemove}
                      className="joker-button"
                      style={{ opacity: isUsed ? 0.6 : 1 }}
                    >
                      {joker.icon} {joker.label}
                    </button>
                  );
                })}
              </div>
            );
          })()}

          <div className="question-box">
            {currentQuestion.question}
          </div>

          {jokerModal && (
            <div className="modal-overlay">
              <div className="modal-content">
                <h3>{jokerModal.title}</h3>
                <div className="whitespace-pre">{jokerModal.content}</div>
                <button onClick={() => setJokerModal(null)}>Close</button>
              </div>
            </div>
          )}

          {(() => {
            const myId = getSafeStorage('userId');
            const me = players.find(p => p.userId === myId) || players.find(p => p.name === getSafeStorage('userName'));
            const isSurvival = gameData?.game_mode === 'survival';
            const isAlive = isSurvival ? (me ? me.lives > 0 : true) : ((gameData?.lives ?? 0) > 0);

            if (!isAlive) {
              return (
                <div className="spectator-mode">
                  <h3>👀 Spectator Mode</h3>
                  <p>You have been eliminated. You can continue watching the game!</p>
                </div>
              );
            }

            return (
              <>
                <div className="options-grid">
                  {currentQuestion.options.map((option, index) => {
                    if (jokerResult?.wrongAnswersToRemove?.includes(option)) {
                      return (
                        <button key={index} disabled className="option-button hidden">-</button>
                      );
                    }

                    return (
                      <button
                        key={index}
                        onClick={() => setSelectedAnswer(option)}
                        disabled={answerSubmitted}
                        className={`option-button ${selectedAnswer === option ? 'selected' : ''}`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
                {!answerSubmitted && (
                  <button
                    onClick={handleAnswerSubmit}
                    disabled={!selectedAnswer}
                    className="submit-button"
                  >
                    Submit Vote
                  </button>
                )}
                {answerSubmitted && <div className="text-secondary text-center mt-2">Vote submitted. Waiting for {gameData?.game_mode === 'survival' ? 'other players' : 'team'}...</div>}
              </>
            );
          })()}
        </div>
      )}

      {!currentQuestion && !revealedAnswers && (
        <div className="text-center p-5">Waiting for game to start...</div>
      )}

      <div className="teammates-section">
        <h3>{gameData?.game_mode === 'survival' ? 'Opponents' : 'Teammates'}</h3>
        <div className="teammates-grid">
          {players.map((p, i) => (
            <div
              key={i}
              className={`teammate-card ${gameData?.game_mode === 'survival' && p.lives === 0 ? 'dead' : ''}`}
            >
              <div className="font-bold">{p.name}</div>
              <div>Current price money: {p.score?.toLocaleString('de-DE')}€</div>
              {gameData?.game_mode === 'survival' && <div>Lives: {p.lives} ❤️</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LobbyPage;