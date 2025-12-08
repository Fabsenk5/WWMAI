import React, { useContext, useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GameContext, GameData, User } from '../context/GameContext'; // Import GameData and User types
import io, { Socket } from 'socket.io-client';
import axios from 'axios';

// Removed local Player interface in favor of User from context

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

  // New state for counting votes/waiting
  const [waitingForCount, setWaitingForCount] = useState<{ count: number, total: number } | null>(null);
  const [teamAnswerInfo, setTeamAnswerInfo] = useState<{ answer: string, isCorrect: boolean } | null>(null);

  // Joker State
  const [jokerResult, setJokerResult] = useState<{ wrongAnswersToRemove?: string[] } | null>(null);
  const [jokerModal, setJokerModal] = useState<{ title: string, content: string } | null>(null);

  const socketRef = useRef<Socket | null>(null);

  const handleUseJoker = async (jokerType: string) => {
    if (!roomCode || !currentQuestion) return;

    const userId = getSafeStorage('userId');
    if (!userId) return;

    // Optimistic check (though disabled in UI)
    // Call API
    try {
      const res = await axios.post(`/api/games/${roomCode}/joker`, {
        userId,
        jokerType
      });

      const data = res.data;

      // Update local state regarding used jokers
      setGameDataFromContext(prev => {
        if (!prev) return null;
        const isSurvival = prev.game_mode === 'survival';

        if (isSurvival) {
          // Update current user's jokers
          const updatedUsers = prev.users.map(u => {
            if (u.userId === userId) {
              return { ...u, jokers_used: [...(u.jokers_used || []), jokerType] };
            }
            return u;
          });
          return { ...prev, users: updatedUsers };
        } else {
          // Update team jokers
          return { ...prev, jokers_used: [...(prev.jokers_used || []), jokerType] };
        }
      });

      // Handle Result
      if (jokerType === '5050') {
        setJokerResult({ wrongAnswersToRemove: data.wrongAnswersToRemove });
      } else if (jokerType === 'audience') {
        // Format stats
        const stats = data.stats;
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

  const buttonStyle = {
    padding: '10px 20px',
    fontSize: '16px',
    cursor: 'pointer',
    borderRadius: '5px',
    border: '1px solid #ccc',
    margin: '5px'
  };

  // Helper for safe storage access
  const getSafeStorage = (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('Storage access restricted', e);
      return null;
    }
  };

  // Helper alias to fix context naming used in effects
  const setGameDataFromContext = setGameData!;

  // Initial State Hydration
  useEffect(() => {
    const hydrateState = async () => {
      if (!roomCode) return;
      try {
        // 0. Fetch Full Game Data (to get game_mode, etc.)
        const gameResponse = await axios.get(`/api/games/${roomCode}`);
        const fullGameData = gameResponse.data;
        console.log('[LobbyPage] Hydrated full game data:', fullGameData);

        // Map players to users to match Context expectation
        if (fullGameData.players) {
          fullGameData.users = fullGameData.players;
        }

        // Update Context with full game data immediately
        setGameDataFromContext(prev => ({
          ...prev,
          ...fullGameData,
          id: fullGameData.game_id, // Map game_id to id explicitly
          status: fullGameData.status || prev?.status || 'pending'
        }));

        // 1. Fetch current question
        const userId = getSafeStorage('userId') || '';
        const qResponse = await axios.get(`/api/games/${roomCode}/current-question?userId=${userId}`);
        const qData = qResponse.data;
        console.log('[LobbyPage] Hydration Question Response Raw:', qData);

        if (qData && (qData.id || qData.question)) {
          console.log('[LobbyPage] Setting valid question:', qData);
          setCurrentQuestion(qData);

          // If user has already answered, update UI
          if (qData.userHasAnswered) {
            console.log('[LobbyPage] User has already answered:', qData.userAnswer);
            setSelectedAnswer(qData.userAnswer);
            setAnswerSubmitted(true);
          }

          setGameDataFromContext(prev => {
            const updates: Partial<GameData> = {};
            if (qData.level) updates.current_level = qData.level;
            return prev ? { ...prev, ...updates } : null;
          });
        } else {
          console.warn('[LobbyPage] Question data missing id or question field:', qData);
        }

        // 2. Fetch Players
        const pResponse = await axios.get(`/api/games/${roomCode}/players`);
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

    // Connect to Socket.IO if not already connected
    if (!socketRef.current) {
      const storedUserId = getSafeStorage('userId');
      socketRef.current = io('/', {
        query: {
          roomCode,
          userId: storedUserId || `user-${Math.random().toString(36).substr(2, 9)}`
        }
      });
    }

    const socket = socketRef.current;

    const onConnect = () => {
      console.log('Connected to socket server');
      if (roomCode) {
        socket.emit('joinRoom', {
          roomCode,
          userId: getSafeStorage('userId'),
          playerName: getSafeStorage('userName')
        });
      }
    };

    socket.on('connect', onConnect);


    // Socket event handlers
    const handleNewQuestion = (question: QuestionPayload) => {
      console.log('[LobbyPage Socket.IO] Received newQuestion:', question);
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

    const handleGameStarted = (data?: { message: string }) => {
      setGameDataFromContext(prev => prev ? { ...prev, status: 'started' } : null);
    };

    const handleRevealAnswers = (data: RevealAnswersPayload & { teamAnswer: string, isTeamCorrect: boolean, livesRemaining: number }) => {
      console.log('[LobbyPage Socket.IO] Received revealAnswers:', data);
      setRevealedAnswers(data);
      setTeamAnswerInfo({ answer: data.teamAnswer, isCorrect: data.isTeamCorrect });
      setCountdown(data.timeToNextQuestion);
      setWaitingForCount(null);

      // Update lives in context
      setGameDataFromContext(prev => prev ? { ...prev, lives: data.livesRemaining } : null);

      // Start countdown
      const countdownInterval = setInterval(() => {
        setCountdown(prevTime => {
          if (prevTime === null || prevTime <= 1) {
            clearInterval(countdownInterval);
            return 0;
          }
          return prevTime - 1;
        });
      }, 1000);

      // Update players list (scores)
      if (roomCode) {
        fetch(`/api/games/${roomCode}/players`)
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

    const handleUserJoined = (data: any) => {
      console.log('[LobbyPage Socket.IO] Received userJoined:', data);
      if (roomCode) {
        axios.get(`/api/games/${roomCode}/players`)
          .then(res => setPlayers(res.data))
          .catch(err => console.error('Failed to update players list:', err));
      }
    }

    const handleJokerUsed = (data: { jokerType: string, userId: string }) => {
      console.log('[LobbyPage Socket] Joker Used:', data);
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
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomCode, setGameDataFromContext, navigate]);

  // Define handleAnswerSubmit inside component
  const handleAnswerSubmit = async () => {
    if (!selectedAnswer || !currentQuestion || !roomCode) return;
    try {
      const userId = getSafeStorage('userId');
      await axios.post(`/api/games/${roomCode}/answer`, {
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

  // RENDER
  if (isValidRoom === null) return <div>Validating...</div>;
  if (!isValidRoom) return <div>Invalid room.</div>;

  return (
    <div className="lobby-page" style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>{gameData?.game_mode === 'survival' ? 'Millionaire Survival' : 'Cooperative Millionaire'}</h1>
        {gameData?.game_mode !== 'survival' && (
          <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: (gameData?.lives || 0) > 1 ? 'green' : 'red' }}>
            Team Lives: {gameData?.lives ?? 3} ❤️
          </div>
        )}
      </header>

      <div style={{ marginBottom: '10px' }}>
        <strong>Room:</strong> {roomCode} | <strong>Level:</strong> {gameData?.current_level ?? 0}
      </div>

      {waitingForCount && !revealedAnswers && (
        <div style={{ padding: '10px', backgroundColor: '#e0e0ff', borderRadius: '5px', marginBottom: '10px' }}>
          Waiting for teammates... ({waitingForCount.count} / {waitingForCount.total} answered)
        </div>
      )}

      {/* REVEAL UI */}
      {revealedAnswers && teamAnswerInfo && (
        <div className="answers-reveal" style={{ textAlign: 'center' }}>
          <h2>Round Results</h2>
          <div style={{ fontSize: '1.5em', margin: '20px' }}>
            {gameData?.game_mode === 'survival' ? (
              <span>See your result below!</span>
            ) : (
              <>
                Team Choice: <strong>{teamAnswerInfo.answer}</strong>
                {teamAnswerInfo.isCorrect ? <span style={{ color: 'green', marginLeft: '10px' }}>✅ Correct!</span> : <span style={{ color: 'red', marginLeft: '10px' }}>❌ Wrong!</span>}
              </>
            )}
          </div>

          <div style={{ margin: '15px' }}>
            Correct Answer: <strong>{revealedAnswers.correctAnswer}</strong>
          </div>

          <p>Next question in {countdown}s...</p>

          <h3>Votes:</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {revealedAnswers.playerAnswers.map((pa, idx) => (
              <li key={idx} style={{ padding: '5px', borderBottom: '1px solid #eee' }}>
                {pa.name}: {pa.answer}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* QUESTION UI */}
      {currentQuestion && !revealedAnswers && (
        <div>
          {/* JOKER UI */}
          {(() => {
            const myId = getSafeStorage('userId');
            const me = players.find(p => p.userId === myId) || players.find(p => p.name === getSafeStorage('userName'));
            const isSurvival = gameData?.game_mode === 'survival';

            // Determine used jokers (local user or team)
            const myUsedJokers = isSurvival
              ? (me?.jokers_used || [])
              : (gameData?.jokers_used || []);

            // If I am dead (or team dead), don't show jokers
            const isAlive = isSurvival ? (me ? me.lives > 0 : true) : ((gameData?.lives ?? 0) > 0);

            if (!isAlive || answerSubmitted) return null;

            const jokers = [
              { type: '5050', label: '50:50', icon: '🌗' },
              { type: 'audience', label: 'Audience', icon: '👥' },
              { type: 'phone', label: 'Phone', icon: '📞' }
            ];

            return (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '15px' }}>
                {jokers.map(joker => {
                  const isUsed = myUsedJokers.includes(joker.type);
                  return (
                    <button
                      key={joker.type}
                      onClick={() => handleUseJoker(joker.type)}
                      disabled={isUsed || !!jokerResult?.wrongAnswersToRemove}
                      style={{
                        ...buttonStyle,
                        backgroundColor: isUsed ? '#ccc' : '#ffeb3b',
                        color: isUsed ? '#666' : 'black',
                        opacity: isUsed ? 0.6 : 1,
                        padding: '5px 15px',
                        fontSize: '0.9em'
                      }}
                    >
                      {joker.icon} {joker.label}
                    </button>
                  );
                })}
              </div>
            );
          })()}

          <div style={{ fontSize: '1.2em', marginBottom: '10px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '10px', color: 'black' }}>
            {currentQuestion.question}
          </div>

          {/* Modal for Joker Results */}
          {jokerModal && (
            <div style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              backgroundColor: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 0 10px rgba(0,0,0,0.5)', zIndex: 1000,
              maxWidth: '80%', textAlign: 'center'
            }}>
              <h3>{jokerModal.title}</h3>
              <div style={{ marginBottom: '15px' }}>{jokerModal.content}</div>
              <button onClick={() => setJokerModal(null)} style={buttonStyle}>Close</button>
            </div>
          )}

          {/* Logic to determine if player is alive */}
          {(() => {
            const myId = getSafeStorage('userId');
            // Try to find by userId first, fallback to name if userId missing in legacy objects (shouldn't happen with new interface)
            const me = players.find(p => p.userId === myId) || players.find(p => p.name === getSafeStorage('userName'));

            // Survival: Check my lives. Cooperative: Check team lives (gameData.lives).
            // Note: In Coop, 0 lives usually ends game, but if here, checking gameData.lives is safe.
            // If me is undefined (not loaded yet), assume alive to avoid premature blocking, or wait.
            const isSurvival = gameData?.game_mode === 'survival';
            const isAlive = isSurvival
              ? (me ? me.lives > 0 : true)
              : ((gameData?.lives ?? 0) > 0);

            if (!isAlive) {
              return (
                <div style={{ padding: '20px', backgroundColor: '#ffeebb', borderRadius: '10px', textAlign: 'center', border: '2px solid #ffa500' }}>
                  <h3>👀 Spectator Mode</h3>
                  <p>You have been eliminated. You can continue watching the game!</p>
                </div>
              );
            }

            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {currentQuestion.options.map((option, index) => {
                    // 50:50 Logic: Hide if in removed list
                    if (jokerResult?.wrongAnswersToRemove?.includes(option)) {
                      return (
                        <button key={index} disabled style={{ ...buttonStyle, visibility: 'hidden' }}>
                          -
                        </button>
                      );
                    }

                    return (
                      <button
                        key={index}
                        onClick={() => setSelectedAnswer(option)}
                        disabled={answerSubmitted}
                        style={{
                          ...buttonStyle,
                          backgroundColor: selectedAnswer === option ? '#add8e6' : '#f0f0f0',
                          opacity: answerSubmitted ? 0.7 : 1,
                          color: 'black'
                        }}
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
                    style={{ ...buttonStyle, marginTop: '20px', width: '100%', backgroundColor: '#4RAF50', color: 'white' }}
                  >
                    Submit Vote
                  </button>
                )}
                {answerSubmitted && <div style={{ marginTop: '10px', color: 'gray' }}>Vote submitted. Waiting for {gameData?.game_mode === 'survival' ? 'other players' : 'team'}...</div>}
              </>
            );
          })()}
        </div>
      )}

      {!currentQuestion && !revealedAnswers && (
        <div style={{ textAlign: 'center', padding: '50px' }}>Waiting for game to start...</div>
      )}

      <div style={{ marginTop: '40px', borderTop: '1px solid #ddd', paddingTop: '20px' }}>
        <h3>Teammates</h3>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          {players.map((p, i) => (
            <div key={i} style={{ padding: '10px', border: '1px solid #eee', borderRadius: '5px', backgroundColor: p.lives === 0 && gameData?.game_mode === 'survival' ? '#ffcccc' : 'white' }}>
              <div style={{ fontWeight: 'bold' }}>{p.name}</div>
              <div>Score: {p.score}</div>
              {gameData?.game_mode === 'survival' && <div>Lives: {p.lives} ❤️</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LobbyPage;