import React, { useContext, useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { GameContext, GameData, User } from '../context/GameContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useTranslation } from 'react-i18next';
import { useModal } from '../context/ModalContext';
import { useAudio } from '../context/AudioContext';
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
  questionTranslations?: Record<string, string>;
  level: number;
  prize: number;
  options: any[]; // Can be string[] (legacy) or {text, translations}[]
  status?: string;
  userHasAnswered?: boolean;
  userAnswer?: string;
}

const LobbyPage: React.FC = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language } = useLanguage();
  const { t } = useTranslation();
  const context = useContext(GameContext);
  const { gameData, setGameData } = context || {};

  const { showModal, showAlert } = useModal();
  const { playTrack, playSFX, getAudioForLevel, stopAll } = useAudio();

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
      setJokerResult(null);

      // Audio: Play background loop for level
      // If it's level 1, play "Let's Play" first? Or just loop question theme.
      // Plan says: Let's Play > Bg Loop.
      const level = question.level || 1;
      const bgTrack = getAudioForLevel(level, 'question');

      // If it is the VERY first question (level 1), maybe play "Let's Play" intro stinger?
      // "10 Let's Play.mp3"
      if (level === 1) {
        playTrack('10 Let\'s Play.mp3', false); // Intro
        setTimeout(() => {
          playTrack(bgTrack, true); // Loop
        }, 4000); // Intro is approx 20s but maybe too long to wait? Let's just start loop after short delay or immediately. 
        // User list says "Let's Play" is 20s. "Let's Play $2,000" is 11s.
        // Ideally we queue it. For now, simple transition.
        playTrack(bgTrack, true);
      } else {
        playTrack(bgTrack, true);
      }

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

      // Audio: Win/Lose
      stopAll(); // Stop background tension
      const level = data.currentLevel || 1;
      if (data.isTeamCorrect) {
        playSFX(getAudioForLevel(level, 'win'));
      } else {
        playSFX(getAudioForLevel(level, 'lose'));
      }
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
      stopAll();
      playTrack('63 Closing Theme.mp3', false); // Play closing theme
      showAlert(data.message, 'Game Over');
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
      // Audio: Joker SFX
      if (data.jokerType === '5050') playSFX('67 50-50.mp3');
      if (data.jokerType === 'audience') playSFX('68 Ask The Audience.mp3');
      if (data.jokerType === 'phone') playSFX('66 Phone-A-Friend.mp3');

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
    socket.on('userJoined', handleUserJoined);
    socket.on('jokerUsed', handleJokerUsed);

    socket.on('playerKicked', (data: { userId: string, name: string }) => {
      // If I am the one kicked
      const myId = getSafeStorage('userId');
      if (data.userId === myId) {
        showAlert('You have been kicked from the room.', 'Kicked');
        navigate('/');
      } else {
        // Refresh player list
        if (roomCode) {
          axios.get(`${API_BASE_URL}/api/games/${roomCode}/players`)
            .then(res => setPlayers(res.data))
            .catch(err => console.error('Failed to update players list:', err));
        }
      }
    });

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
        showModal({ title: 'Audience Poll Result', body: <div className="whitespace-pre">{content}</div>, hideCancel: true, confirmText: 'OK' });
      } else if (jokerType === 'phone') {
        showModal({ title: 'Phone a Friend', body: data.message, hideCancel: true, confirmText: 'Thanks' });
      }
    } catch (err) {
      console.error('Failed to use joker:', err);
      showAlert('Failed to use joker. It may be already used.', 'Error');
    }
  };

  const handleKickPlayer = async (userIdToKick: string) => {
    if (!roomCode) return;

    showModal({
      title: 'Kick Player',
      body: 'Are you sure you want to kick this player?',
      confirmText: 'Kick',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          // Need token for auth
          const token = localStorage.getItem('token');
          await axios.post(`${API_BASE_URL}/api/games/${roomCode}/kick`,
            { userIdToKick },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          // Socket will handle the UI update via 'playerKicked' event
        } catch (error: any) {
          console.error('Failed to kick player:', error);
          showAlert(error.response?.data?.error || 'Failed to kick player', 'Error');
        }
      }
    });
  };


  // Old handleKickPlayer partially replaced within showModal above. 
  // Need to merge logic. Let's redefine main function body properly.


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
      // Audio: Final Answer
      const level = currentQuestion.level || 1;
      playSFX(getAudioForLevel(level, 'final_answer'));
    } catch (error: any) {
      console.error('Error submitting answer:', error);
      const msg = error.response?.data?.error || 'Failed to submit answer';
      // Specific handling for elimination/spectator error to provide visual feedback
      if (msg.toLowerCase().includes('eliminated')) {
        showAlert('You are eliminated and cannot vote! (Spectator)', 'Spectator Mode');
      } else {
        showAlert(msg, 'Error');
      }
    }
  };

  if (isValidRoom === null) return <div className="loading">Validating...</div>;
  if (!isValidRoom) return <div className="error">Invalid room.</div>;

  return (
    <div className="lobby-page">
      <header className="lobby-header">
        <h1>{gameData?.game_mode === 'survival' ? t('game_mode_survival') : t('game_mode_coop')}</h1>
        {gameData?.game_mode !== 'survival' && (
          <div className={`lobby-lives ${(gameData?.lives || 0) > 1 ? 'text-success' : 'text-danger'}`}>
            {t('team_lives')}: {gameData?.lives ?? 3} ❤️
          </div>
        )}
      </header>

      <div className="lobby-room-info">
        <strong>{t('room')}:</strong> {roomCode} | <strong>{t('level')}:</strong> {gameData?.current_level ?? 0}
      </div>

      {waitingForCount && !revealedAnswers && (
        <div className="waiting-message">
          {t('waiting_teammates')} ({waitingForCount.count} / {waitingForCount.total})
        </div>
      )}

      {revealedAnswers && teamAnswerInfo && (
        <div className="answers-reveal">
          <h2>{t('round_results')}</h2>

          {(() => {
            const myName = getSafeStorage('userName');
            const myUserId = getSafeStorage('userId');

            // Try to find my result by userId first (more reliable), then fallback to name
            const myResult = revealedAnswers.playerAnswers.find(p =>
              (myUserId && (p as any).userId === myUserId) || p.name === myName
            );

            return (
              <div className="result-message">
                {gameData?.game_mode === 'survival' ? (
                  myResult ? (
                    <div style={{ fontSize: '1.2em', margin: '10px 0' }}>
                      {t('your_answer')}: <strong>
                        {(() => {
                          // Lookup translation
                          const opt = currentQuestion?.options?.find((o: any) => (typeof o === 'string' ? o : o.text) === myResult.answer);
                          if (opt && typeof opt !== 'string' && opt.translations && opt.translations[language]) {
                            return opt.translations[language];
                          }
                          return myResult.answer;
                        })()}
                      </strong>
                      <span style={{ marginLeft: '10px' }}>
                        {myResult.is_correct ? '✅' : '❌'}
                      </span>
                    </div>
                  ) : (
                    <p>You did not answer.</p>
                  )
                ) : (
                  <>
                    {t('team_choice')}: <strong>
                      {(() => {
                        const ans = teamAnswerInfo.answer;
                        const opt = currentQuestion?.options?.find((o: any) => (typeof o === 'string' ? o : o.text) === ans);
                        if (opt && typeof opt !== 'string' && opt.translations && opt.translations[language]) {
                          return opt.translations[language];
                        }
                        return ans;
                      })()}
                    </strong>
                    {teamAnswerInfo.isCorrect
                      ? <span className="text-success ml-2">✅</span>
                      : <span className="text-danger ml-2">❌</span>}
                  </>
                )}
              </div>
            );
          })()}

          <div className="correct-answer-box">
            {t('correct_answer')}: <strong>
              {(() => {
                const ans = revealedAnswers.correctAnswer;
                const opt = currentQuestion?.options?.find((o: any) => (typeof o === 'string' ? o : o.text) === ans);
                if (opt && typeof opt !== 'string' && opt.translations && opt.translations[language]) {
                  return opt.translations[language];
                }
                return ans;
              })()}
            </strong>
          </div>

          <p>{t('next_question_in')} {countdown}s...</p>

          <h3>{t('votes')}:</h3>
          <ul className="list-none">
            {revealedAnswers.playerAnswers.map((pa, idx) => {
              const displayAnswer = (() => {
                const opt = currentQuestion?.options?.find((o: any) => (typeof o === 'string' ? o : o.text) === pa.answer);
                if (opt && typeof opt !== 'string' && opt.translations && opt.translations[language]) {
                  return opt.translations[language];
                }
                return pa.answer;
              })();
              return (
                <li key={idx} className="border-bottom" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
                  <span>{pa.name}: <strong>{displayAnswer}</strong></span>
                  <span>{pa.is_correct ? '✅' : '❌'}</span>
                </li>
              );
            })}
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
              { type: 'audience', label: t('joker_audience'), icon: '👥' },
              { type: 'phone', label: t('joker_phone'), icon: '📞' }
            ];

            return (
              <div className="joker-container">
                {jokers.map(joker => {
                  const isUsed = myUsedJokers.includes(joker.type);
                  return (
                    <button
                      key={joker.type}
                      onClick={() => handleUseJoker(joker.type)}
                      disabled={isUsed}
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
            {(currentQuestion.questionTranslations && currentQuestion.questionTranslations[language])
              ? currentQuestion.questionTranslations[language]
              : currentQuestion.question}
          </div>

          {/* Modal now handled by Context */}

          {(() => {
            const myUserId = getSafeStorage('userId');
            const myName = getSafeStorage('userName');
            const me = players.find(p => (myUserId && p.userId === myUserId)) || players.find(p => p.name === myName);
            const isSurvival = gameData?.game_mode === 'survival';
            const isAlive = isSurvival ? (me ? me.lives > 0 : true) : ((gameData?.lives ?? 0) > 0);

            if (!isAlive) {
              // Render disabled view for spectators instead of hiding everything
            }

            return (
              <>
                {!isAlive && (
                  <div style={{ textAlign: 'center', margin: '10px 0', color: 'var(--danger-color)', fontWeight: 'bold' }}>
                    🚫 You are eliminated (Spectator Mode) 🚫
                  </div>
                )}
                <div className="options-grid">
                  {currentQuestion.options.map((option, index) => {
                    const isLegacy = typeof option === 'string';
                    const optionText = isLegacy ? option : option.text;
                    const optionDisplay = isLegacy
                      ? option
                      : (option.translations && option.translations[language] ? option.translations[language] : option.text);

                    if (jokerResult?.wrongAnswersToRemove?.includes(optionText)) {
                      return (
                        <button key={index} disabled className="option-button hidden">-</button>
                      );
                    }

                    return (
                      <button
                        key={index}
                        onClick={() => setSelectedAnswer(optionText)}
                        disabled={answerSubmitted || !isAlive}
                        className={`option-button ${selectedAnswer === optionText ? 'selected' : ''}`}
                        style={{
                          opacity: !isAlive ? 0.6 : 1,
                          cursor: !isAlive ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {optionDisplay}
                      </button>
                    );
                  })}
                </div>
                {!answerSubmitted && (
                  <button
                    onClick={handleAnswerSubmit}
                    disabled={!selectedAnswer || !isAlive}
                    className="submit-button"
                    style={{
                      backgroundColor: !isAlive ? '#555' : '',
                      cursor: !isAlive ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {!isAlive ? t('btn_eliminated') : t('btn_submit')}
                  </button>
                )}
                {answerSubmitted && <div className="text-secondary text-center mt-2">{t('votes')}...</div>}
              </>
            );
          })()}
        </div>
      )}

      {!currentQuestion && !revealedAnswers && (
        <div className="text-center p-5">{t('waiting_start')}</div>
      )}

      <div className="teammates-section">
        <h3>{gameData?.game_mode === 'survival' ? t('opponents') : t('teammates')}</h3>
        <div className="teammates-grid">
          {players.map((p, i) => (
            <div
              key={i}
              className={`teammate-card ${gameData?.game_mode === 'survival' && p.lives === 0 ? 'dead' : ''}`}
              style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              {/* Avatar Display */}
              <div style={{
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                overflow: 'hidden',
                marginBottom: '8px',
                border: '2px solid rgba(255,255,255,0.2)',
                backgroundColor: '#333'
              }}>
                {p.avatar_url ? (
                  <img
                    src={p.avatar_url}
                    alt={p.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#555',
                    fontSize: '1.2em'
                  }}>
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="font-bold">{p.name}</div>
              <div>{t('price_money')}: {p.score?.toLocaleString('de-DE')}€</div>
              {gameData?.game_mode === 'survival' && <div>Lives: {p.lives} ❤️</div>}

              {/* HOST CONTROLS */}
              {/* Check if current user is host (via gameData.host_id, assuming we expose it) */}
              {/* Since we didn't add host_id to GameData interface yet, we might check via user ID comparison if we fetched it */}
              {/* We need to update GameData interface or just assume we have it in gameData from API */}
              {/* Assuming gameData includes host_id now (API sends * from games table) */}
              {user && user.id === (gameData as any)?.host_id && p.userId !== user.id.toString() && (
                <div style={{ marginTop: '10px' }}>
                  {user.subscription_status === 'premium' ? (
                    <button
                      onClick={() => handleKickPlayer(p.userId)}
                      className="btn btn-sm btn-danger"
                      style={{ fontSize: '0.7em', padding: '2px 5px' }}
                    >
                      {t('btn_kick')} 👢
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LobbyPage;