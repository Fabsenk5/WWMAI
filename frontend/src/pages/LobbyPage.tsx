import React, { useContext, useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GameContext, GameData, User } from '../context/GameContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useTranslation } from 'react-i18next';
import { useModal } from '../context/ModalContext';
import { useAudio } from '../context/AudioContext';
import io, { Socket } from 'socket.io-client';
import axios from 'axios';
import { Heart, Skull, Trophy, Split, Users, Phone, UserX, CheckCircle2, XCircle, EyeOff } from 'lucide-react';
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

const getSafeStorage = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.warn('Storage access restricted', e);
    return null;
  }
};

const LobbyPage: React.FC = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { user, isLoading } = useAuth(); // Destructure isLoading
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
  const [gameResult, setGameResult] = useState<'victory' | 'defeat' | null>(null); // New state

  const [waitingForCount, setWaitingForCount] = useState<{ count: number, total: number } | null>(null);
  const [teamAnswerInfo, setTeamAnswerInfo] = useState<{ answer: string, isCorrect: boolean } | null>(null);

  const [jokerResult, setJokerResult] = useState<{ wrongAnswersToRemove?: string[] } | null>(null);

  // REMOVED early return here to avoid conditional hook execution error

  const socketRef = useRef<Socket | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    if (roomCode && !isLoading) hydrateState();
  }, [roomCode, setGameDataFromContext, isLoading]);

  useEffect(() => {
    if (!roomCode || !setGameDataFromContext || isLoading) return;

    // (Deferring replacement until I locate the return statement - I need to scroll further down) (from AuthContext), use that. Otherwise fallback to storage or random guest.
    const effectiveUserId = user ? String(user.id) : (getSafeStorage('userId') || `user-${Math.random().toString(36).substr(2, 9)}`);
    const effectiveUserName = user ? user.username : (getSafeStorage('userName') || 'Guest');

    if (!socketRef.current) {
      socketRef.current = io(API_BASE_URL, {
        query: {
          roomCode,
          userId: effectiveUserId
        }
      });
    }

    const socket = socketRef.current;

    // Ensure we are connected before emitting join, or wait for connect
    if (socket.connected) {
      socket.emit('joinRoom', {
        roomCode,
        userId: effectiveUserId,
        playerName: effectiveUserName
      });
    }

    const onConnect = () => {
      if (roomCode) {
        socket.emit('joinRoom', {
          roomCode,
          userId: effectiveUserId,
          playerName: effectiveUserName
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

    const handleRevealAnswers = (data: RevealAnswersPayload & { teamAnswer: string, isTeamCorrect: boolean, livesRemaining: number, gameEnded?: boolean, gameMode?: string }) => {
      setRevealedAnswers(data);
      setTeamAnswerInfo({ answer: data.teamAnswer, isCorrect: data.isTeamCorrect });
      setCountdown(data.timeToNextQuestion);

      // Audio: Win/Lose
      stopAll(); // Stop background tension
      const level = data.currentLevel || 1;
      // Survival has no teamAnswer/isTeamCorrect — use the player's own result
      let isCorrectForSound = data.isTeamCorrect;
      if (data.gameMode === 'survival') {
        const myName = getSafeStorage('userName');
        const myUserId = getSafeStorage('userId');
        const myResult = data.playerAnswers.find(p =>
          (myUserId && (p as any).userId === myUserId) || p.name === myName
        );
        isCorrectForSound = myResult ? myResult.is_correct : true;
      }
      if (isCorrectForSound) {
        playSFX(getAudioForLevel(level, 'win'));
      } else {
        playSFX(getAudioForLevel(level, 'lose'));
      }
      setWaitingForCount(null);
      setGameDataFromContext(prev => prev ? { ...prev, lives: data.livesRemaining } : null);

      // Handle Game End inline
      if (data.gameEnded) {
        // Determine Result
        // Survival: If lives > 0 and level >= 15 -> Victory, else Defeat
        // Co-op: isTeamCorrect on last level -> Victory, else Defeat
        let result: 'victory' | 'defeat' = 'defeat';

        if (data.gameMode === 'survival') {
          // Survival: Victory if Level 15 reached AND (I am alive OR I just answered correctly)
          // Actually, if gameEnded=true at level 15, it implies the game was beaten.
          // Let's trust the level.
          if (data.currentLevel >= 15) {
            result = 'victory';
          }
        } else {
          // Co-op: Victory if Team Correct at Level 15
          if (data.isTeamCorrect && data.currentLevel >= 15) {
            result = 'victory';
          }
        }

        // Override: if lives == 0, it is defeat for ME in survival (even if others win?)
        // The user wants "Game Over" if THEY lost.
        // Wait, if I am dead but the game ends at 15... 
        // If I am dead earlier, I see spectator mode.
        // If I survive to 15, result is victory.
        if (data.livesRemaining === 0) {
          result = 'defeat';
        }

        console.log(`[GameResult] Level: ${data.currentLevel}, Lives: ${data.livesRemaining}, Mode: ${data.gameMode} -> Result: ${result}`);
        setGameResult(result);
      }

      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      const countdownInterval = setInterval(() => {
        setCountdown(prevTime => {
          if (prevTime === null || prevTime <= 1) {
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }
            return 0;
          }
          return prevTime - 1;
        });
      }, 1000);
      countdownIntervalRef.current = countdownInterval;

      if (roomCode) {
        fetch(`${API_BASE_URL}/api/games/${roomCode}/players`)
          .then(res => res.json())
          .then(updatedPlayers => setPlayers(updatedPlayers))
          .catch(console.error);
      }
    };

    const handleGamePaused = () => {
      setGameDataFromContext(prev => prev ? { ...prev, status: 'paused' } : null);
    };

    const handleGameResumed = () => {
      setGameDataFromContext(prev => prev ? { ...prev, status: 'started' } : null);
    };

    const handleGameEnded = (data: { message: string }) => {
      // Backend still emits this after 30s. We can use it to force redirect.
      stopAll();
      playTrack('63 Closing Theme.mp3', false);
      // Do NOT show blocking alert if we already showed the inline result.
      // But maybe we want to redirect now?
      // navigate('/'); 
      // User said "delay redirection". 
      // The backend emits this event 30s later specifically for this.
      // So yes, we should redirect now.
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
    socket.on('jokerUsed', handleJokerUsed);
    socket.on('gamePaused', handleGamePaused);
    socket.on('gameResumed', handleGameResumed);

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
      socket.off('gamePaused', handleGamePaused);
      socket.off('gameResumed', handleGameResumed);
      if (socket.connected) socket.disconnect();
      socketRef.current = null;
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [roomCode, setGameDataFromContext, navigate, getAudioForLevel, playSFX, playTrack, stopAll, showAlert, isLoading, user]);

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
  // Wait for auth to initialize for rendering
  if (isLoading) return <div className="loading-container">Loading...</div>;

  return (
    <div className="lobby-page">
      <header className="lobby-header">
        <h1>{gameData?.game_mode === 'survival' ? t('game_mode_survival') : t('game_mode_coop')}</h1>
        {gameData?.game_mode !== 'survival' && (
          <div className={`lobby-lives ${(gameData?.lives || 0) > 1 ? 'text-success' : 'text-danger'} ${(gameData?.lives ?? 3) <= 1 ? 'lives-low' : ''}`}>
            <Heart size={18} fill="currentColor" /> {t('team_lives')}: {gameData?.lives ?? 3}
          </div>
        )}
      </header>

      <div className="lobby-room-info">
        <strong>{t('room')}:</strong> {roomCode} | <strong>{t('level')}:</strong> {gameData?.current_level ?? 0}
      </div>

      {gameData?.status === 'paused' && (
        <div className="waiting-message">{t('game_paused')}</div>
      )}

      {waitingForCount && !revealedAnswers && (
        <div className="waiting-message">
          {t('waiting_teammates')} ({waitingForCount.count} / {waitingForCount.total})
        </div>
      )}

      {revealedAnswers && teamAnswerInfo && (
        <div className="answers-reveal">

          {/* Game Over / Victory Banner */}
          {gameResult && (
            <>
              <div className={`game-over-banner ${gameResult}`}>
                <div className="game-over-title">
                  {gameResult === 'victory'
                    ? <><Trophy size={34} /> VICTORY! <Trophy size={34} /></>
                    : <><Skull size={34} /> GAME OVER <Skull size={34} /></>}
                </div>
                <div className="game-over-text">
                  {gameResult === 'victory'
                    ? 'Congratulations! You are a Millionaire!'
                    : 'Better luck next time!'}
                </div>
                <button className="leave-btn" onClick={() => navigate('/')}>
                  Main Menu
                </button>
              </div>

              {/* Effects */}
              {gameResult === 'victory' && (
                <div className="fireworks-container">
                  <div className="firework"></div>
                  <div className="firework"></div>
                  <div className="firework"></div>
                </div>
              )}
              {gameResult === 'defeat' && (
                <div className="skulls-container">
                  {Array.from({ length: 15 }).map((_, i) => (
                    <div
                      key={i}
                      className="falling-skull"
                      style={{
                        left: `${Math.random() * 100}vw`,
                        animationDuration: `${2 + Math.random() * 3}s`,
                        animationDelay: `${Math.random() * 2}s`
                      }}
                    >
                      💀
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <h2>{t('round_results')}</h2>

          <div className="result-grid">

            {/* User Answer Card */}
            <div className="result-card user">
              <span className="result-label">
                {gameData?.game_mode === 'survival' ? t('your_answer') : t('team_choice')}
              </span>

              {(() => {
                const myName = getSafeStorage('userName');
                const myUserId = getSafeStorage('userId');

                let answerText = '';
                let isCorrect = false;

                if (gameData?.game_mode === 'survival') {
                  const myResult = revealedAnswers.playerAnswers.find(p =>
                    (myUserId && (p as any).userId === myUserId) || p.name === myName
                  );
                  if (myResult) {
                    answerText = myResult.answer;
                    isCorrect = myResult.is_correct;
                  } else {
                    answerText = 'Did not answer';
                  }
                } else {
                  // Co-op
                  answerText = teamAnswerInfo.answer;
                  isCorrect = teamAnswerInfo.isCorrect;
                }

                // Translation & Prefix
                const optIndex = currentQuestion?.options ? currentQuestion.options.findIndex((o: any) => (typeof o === 'string' ? o : o.text) === answerText) : -1;
                const prefix = (optIndex !== undefined && optIndex !== -1) ? String.fromCharCode(65 + optIndex) + ': ' : '';

                const opt = currentQuestion?.options?.find((o: any) => (typeof o === 'string' ? o : o.text) === answerText);
                let displayText = answerText;
                if (opt && typeof opt !== 'string' && opt.translations && opt.translations[language]) {
                  displayText = opt.translations[language];
                }

                return (
                  <div className="result-value">
                    <span>{prefix}{displayText}</span>{isCorrect ? <CheckCircle2 className="result-icon correct" size={22} /> : <XCircle className="result-icon wrong" size={22} />}
                  </div>
                );
              })()}
            </div>

            {/* Correct Answer Card */}
            <div className="result-card correct">
              <span className="result-label">{t('correct_answer')}</span>
              <div className="result-value">
                {(() => {
                  const ans = revealedAnswers.correctAnswer;
                  const optIndex = currentQuestion?.options ? currentQuestion.options.findIndex((o: any) => (typeof o === 'string' ? o : o.text) === ans) : -1;
                  const prefix = optIndex !== -1 ? String.fromCharCode(65 + optIndex) + ': ' : '';

                  const opt = currentQuestion?.options?.find((o: any) => (typeof o === 'string' ? o : o.text) === ans);
                  let displayText = ans;
                  if (opt && typeof opt !== 'string' && opt.translations && opt.translations[language]) {
                    displayText = opt.translations[language];
                  }

                  return <>{prefix}{displayText}</>;
                })()}
              </div>
            </div>
          </div>

          <p className="timer-text">{t('next_question_in')} {countdown}s...</p>

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
                <li key={idx} className="border-bottom vote-row">
                  <span>{pa.name}: <strong>{displayAnswer}</strong></span>
                  {pa.is_correct ? <CheckCircle2 className="text-success vote-icon" size={18} /> : <XCircle className="text-danger vote-icon" size={18} />}
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

            if (!isAlive || answerSubmitted || gameData?.status === 'paused') return null;

            const jokers = [
              { type: '5050', label: '50:50', Icon: Split },
              { type: 'audience', label: t('joker_audience'), Icon: Users },
              { type: 'phone', label: t('joker_phone'), Icon: Phone }
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
                    >
                      <joker.Icon size={16} /> {joker.label}
                    </button>
                  );
                })}
              </div>
            );
          })()}

          <div className="question-box">
            <div className="question-meta">
              <span className="question-meta-badge">{t('level')}: {currentQuestion.level}</span>
              <span className="question-meta-badge">{t('price_money')}: {currentQuestion.prize?.toLocaleString('de-DE')}€</span>
            </div>
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
                  <div className="spectator-mode">
                    <EyeOff size={18} /> You are eliminated (Spectator Mode)
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

                    const prefix = String.fromCharCode(65 + index); // 65 is 'A'

                    return (
                      <button
                        key={index}
                        onClick={() => setSelectedAnswer(optionText)}
                        disabled={!isAlive || answerSubmitted || gameData?.status === 'paused'}
                        className={`option-button ${selectedAnswer === optionText ? 'selected' : ''}`}
                      >
                        <span className="option-prefix">{prefix}</span> {optionDisplay}
                      </button>
                    );
                  })}
                </div>
                {!answerSubmitted && (
                  <button
                    onClick={handleAnswerSubmit}
                    disabled={!selectedAnswer || !isAlive || gameData?.status === 'paused'}
                    className="submit-button"
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
            >
              {/* Avatar Display */}
              <div className="teammate-avatar">
                {p.avatar_url ? (
                  <img
                    src={p.avatar_url}
                    alt={p.name}
                  />
                ) : (
                  <span className="teammate-avatar-initial">
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              {gameData?.game_mode === 'survival' && p.lives === 0 && (
                <div className="teammate-dead-overlay">
                  <Skull size={24} />
                </div>
              )}

              <div className="font-bold">{p.name}</div>
              <div>{t('price_money')}: {p.score?.toLocaleString('de-DE')}€</div>
              {gameData?.game_mode === 'survival' && (
                <div className="lives-row">
                  {p.lives === 0 ? <Skull size={14} /> : <Heart size={14} fill="currentColor" />} Lives: {p.lives}
                </div>
              )}

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
                      <UserX size={13} /> {t('btn_kick')}
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