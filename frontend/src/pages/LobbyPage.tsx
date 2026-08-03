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
import { Heart, Skull, Trophy, Split, Users, Phone, UserX, CheckCircle2, XCircle, EyeOff, Timer, Link2, LogOut, WifiOff, RefreshCw } from 'lucide-react';
import './LobbyPage.css';
import '../styles/RoomSocial.css';
import EmoteBar from '../components/EmoteBar';
import RoomChat from '../components/RoomChat';
import { API_BASE_URL } from '../config/api';
import { isInitialAvatar, getAvatarColor } from '../utils/avatar';

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
  answerDeadline?: number;
}

const getSafeStorage = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.warn('Storage access restricted', e);
    return null;
  }
};

const PRIZE_LADDER = [50, 100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 500000, 1000000];

const LobbyPage: React.FC = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { user, isLoading } = useAuth(); // Destructure isLoading
  const { language } = useLanguage();
  const { t } = useTranslation();
  const context = useContext(GameContext);
  const { gameData, setGameData } = context || {};

  const { showModal, showAlert } = useModal();
  const { playTrack, playSFX, playTick, playClick, getAudioForLevel, stopAll } = useAudio();

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

  // Question answer timer (mirrors the server-side 45s round timeout)
  const [answerDeadline, setAnswerDeadline] = useState<number | null>(null);
  const [answerTimeLeft, setAnswerTimeLeft] = useState<number | null>(null);
  const [pausedRemaining, setPausedRemaining] = useState<number | null>(null);

  // Players whose socket disconnected (shown as offline in the teammate grid)
  const [offlineUsers, setOfflineUsers] = useState<Set<string>>(new Set());
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Emotes + chat
  const [emotes, setEmotes] = useState<{ id: number; userId: string; emote: string }[]>([]);
  const emoteIdRef = useRef(0);
  const [chatMessages, setChatMessages] = useState<{ userId: string; text: string }[]>([]);

  // Personal round stats for the end-of-game summary
  const [roundStats, setRoundStats] = useState({ correct: 0, total: 0 });

  // REMOVED early return here to avoid conditional hook execution error

  const socketRef = useRef<Socket | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingTrackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerDeadlineRef = useRef<number | null>(null);
  const pausedRemainingRef = useRef<number | null>(null);
  const timesUpPlayedRef = useRef(false);

  // Countdown toward the server's answer deadline (frozen while paused)
  useEffect(() => {
    answerDeadlineRef.current = answerDeadline;
    if (!answerDeadline) {
      setAnswerTimeLeft(null);
      return;
    }
    const tick = () => {
      if (gameData?.status === 'paused') return;
      setAnswerTimeLeft(Math.max(0, Math.ceil((answerDeadline - Date.now()) / 1000)));
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [answerDeadline, gameData?.status]);

  useEffect(() => {
    pausedRemainingRef.current = pausedRemaining;
  }, [pausedRemaining]);

  // Countdown sounds: ticks for the last 10 seconds, "Time's Up" at zero
  useEffect(() => {
    if (answerTimeLeft === null || revealedAnswers || answerSubmitted) return;
    if (answerTimeLeft <= 10 && answerTimeLeft > 0) {
      playTick();
    } else if (answerTimeLeft === 0 && !timesUpPlayedRef.current) {
      timesUpPlayedRef.current = true;
      playSFX('72 Time\'s Up.mp3');
    }
  }, [answerTimeLeft, revealedAnswers, answerSubmitted, playTick, playSFX]);

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
          if (qData.answerDeadline) {
            if (qData.status === 'paused') {
              // Game is paused: freeze the countdown with the remaining time so
              // it is re-derived correctly on resume
              setPausedRemaining(Math.max(0, qData.answerDeadline - Date.now()));
              setAnswerDeadline(null);
            } else {
              setAnswerDeadline(qData.answerDeadline);
            }
          }
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
      setAnswerDeadline(question.answerDeadline || null);
      setPausedRemaining(null);
      timesUpPlayedRef.current = false;

      // Audio: Play background loop for level
      // Level 1 plays the "Let's Play" intro stinger first, then the level loop.
      const level = question.level || 1;
      const bgTrack = getAudioForLevel(level, 'question');

      if (level === 1) {
        playTrack('10 Let\'s Play.mp3', false); // Intro stinger
        if (pendingTrackTimeoutRef.current) {
          clearTimeout(pendingTrackTimeoutRef.current);
        }
        pendingTrackTimeoutRef.current = setTimeout(() => {
          playTrack(bgTrack, true); // Level loop after the intro
          pendingTrackTimeoutRef.current = null;
        }, 4000);
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
      setAnswerDeadline(null); // round over — stop the answer countdown
      setPausedRemaining(null);

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

      // Track personal round stats for the end-of-game summary
      setRoundStats(prev => {
        let isCorrectForStats = false;
        if (data.gameMode === 'survival') {
          const myName = getSafeStorage('userName');
          const myUserId = getSafeStorage('userId');
          const myResult = data.playerAnswers.find(p =>
            (myUserId && (p as any).userId === myUserId) || p.name === myName
          );
          if (!myResult) return prev; // spectator without own answer: not counted
          isCorrectForStats = myResult.is_correct;
        } else {
          isCorrectForStats = data.isTeamCorrect;
        }
        return { correct: prev.correct + (isCorrectForStats ? 1 : 0), total: prev.total + 1 };
      });

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
      // Freeze the answer countdown with the remaining time
      const deadline = answerDeadlineRef.current;
      setPausedRemaining(deadline ? Math.max(0, deadline - Date.now()) : null);
      setAnswerDeadline(null);
      setGameDataFromContext(prev => prev ? { ...prev, status: 'paused' } : null);
    };

    const handleGameResumed = () => {
      const remaining = pausedRemainingRef.current;
      if (remaining !== null) {
        setAnswerDeadline(Date.now() + remaining);
        setPausedRemaining(null);
      }
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

    const handleUserJoined = (data: { userId: string }) => {
      // Player is back online
      if (data?.userId) {
        setOfflineUsers(prev => {
          const next = new Set(prev);
          next.delete(data.userId);
          return next;
        });
      }
      if (roomCode) {
        axios.get(`${API_BASE_URL}/api/games/${roomCode}/players`)
          .then(res => setPlayers(res.data))
          .catch(err => console.error('Failed to update players list:', err));
      }
    };

    const handlePlayerDisconnected = (data: { userId: string }) => {
      if (data?.userId) {
        setOfflineUsers(prev => new Set(prev).add(data.userId));
      }
    };

    const handlePlayerEmote = (data: { userId: string; emote: string }) => {
      if (!data?.emote) return;
      const id = ++emoteIdRef.current;
      setEmotes(prev => [...prev.slice(-9), { id, userId: data.userId, emote: data.emote }]);
      setTimeout(() => {
        setEmotes(prev => prev.filter(e => e.id !== id));
      }, 2500);
    };

    const handleChatMessage = (data: { userId: string; text: string }) => {
      if (!data?.text) return;
      setChatMessages(prev => [...prev.slice(-49), { userId: data.userId, text: data.text }]);
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
    socket.on('questionSwitched', handleNewQuestion);
    socket.on('playerAnswered', handlePlayerAnswered);
    socket.on('gameStarted', handleGameStarted);
    socket.on('revealAnswers', handleRevealAnswers);
    socket.on('gameEnded', handleGameEnded);
    socket.on('userJoined', handleUserJoined);
    socket.on('playerDisconnected', handlePlayerDisconnected);
    socket.on('playerEmote', handlePlayerEmote);
    socket.on('chatMessage', handleChatMessage);
    socket.on('jokerUsed', handleJokerUsed);
    socket.on('gamePaused', handleGamePaused);
    socket.on('gameResumed', handleGameResumed);

    socket.on('playerLeft', () => {
      if (roomCode) {
        axios.get(`${API_BASE_URL}/api/games/${roomCode}/players`)
          .then(res => setPlayers(res.data))
          .catch(err => console.error('Failed to update players list:', err));
      }
    });

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
      socket.off('questionSwitched', handleNewQuestion);
      socket.off('playerAnswered', handlePlayerAnswered);
      socket.off('gameStarted', handleGameStarted);
      socket.off('revealAnswers', handleRevealAnswers);
      socket.off('gameEnded', handleGameEnded);
      socket.off('userJoined', handleUserJoined);
      socket.off('playerDisconnected', handlePlayerDisconnected);
      socket.off('playerEmote', handlePlayerEmote);
      socket.off('chatMessage', handleChatMessage);
      socket.off('jokerUsed', handleJokerUsed);
      socket.off('gamePaused', handleGamePaused);
      socket.off('gameResumed', handleGameResumed);
      if (socket.connected) socket.disconnect();
      socketRef.current = null;
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      if (pendingTrackTimeoutRef.current) {
        clearTimeout(pendingTrackTimeoutRef.current);
        pendingTrackTimeoutRef.current = null;
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


  const handleStartGame = async () => {
    if (!roomCode) return;
    try {
      const token = getSafeStorage('token');
      const res = await fetch(`${API_BASE_URL}/api/games/${roomCode}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ userId: user ? String(user.id) : getSafeStorage('userId') }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showAlert(data.error || 'Failed to start game', 'Error');
      }
    } catch (err) {
      console.error('Failed to start game:', err);
      showAlert('Failed to start game', 'Error');
    }
  };

  const handleCopyInvite = async () => {
    if (!roomCode) return;
    const url = `${window.location.origin}/join?roomCode=${roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2000);
    } catch (err) {
      console.error('Failed to copy invite link:', err);
    }
  };

  const handleLeave = async () => {
    if (!roomCode) return;
    const userId = getSafeStorage('userId');
    try {
      await axios.post(`${API_BASE_URL}/api/games/${roomCode}/leave`, { userId });
    } catch (err) {
      console.error('Failed to leave game:', err);
    }
    navigate('/');
  };

  const sendEmote = (emote: string) => {
    socketRef.current?.emit('playerEmote', { emote });
  };

  const sendChat = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    socketRef.current?.emit('chatMessage', { text: trimmed });
    setChatMessages(prev => [...prev.slice(-49), { userId: getSafeStorage('userId') || 'me', text: trimmed }]);
  };

  const getPlayerName = (userId: string) => {
    const p = players.find(pl => pl.userId === userId);
    if (p) return p.name;
    if (userId === 'me' || userId === (getSafeStorage('userId') || '')) return 'Du';
    return userId;
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
        <div className="lobby-header-actions">
          {gameData?.game_mode !== 'survival' && (
            <div className={`lobby-lives ${(gameData?.lives || 0) > 1 ? 'text-success' : 'text-danger'} ${(gameData?.lives ?? 3) <= 1 ? 'lives-low' : ''}`}>
              <Heart size={18} fill="currentColor" /> {t('team_lives')}: {gameData?.lives ?? 3}
            </div>
          )}
          {gameData?.status === 'pending'
            && gameData?.host_id !== undefined && gameData?.host_id !== null
            && String(gameData?.host_id) === String(user?.id) && (
            <button className="btn btn-primary btn-sm" onClick={handleStartGame}>
              {t('start_game')}
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={handleLeave} title="Leave game">
            <LogOut size={14} />
          </button>
        </div>
      </header>

      <div className="lobby-room-info">
        <strong>{t('room')}:</strong> {roomCode} | <strong>{t('level')}:</strong> {gameData?.current_level ?? 0}
        <button className="copy-link-btn" onClick={handleCopyInvite} title={copiedInvite ? 'Link copied!' : 'Copy invite link'}>
          <Link2 size={14} /> {copiedInvite ? '✓' : ''}
        </button>
      </div>

      <div className="prize-ladder" aria-label="Prize ladder">
        {PRIZE_LADDER.map((prize, i) => {
          const level = i + 1;
          const currentLevel = gameData?.current_level || 0;
          const cls = level === currentLevel ? 'current' : (level < currentLevel ? 'reached' : '');
          return (
            <div key={level} className={`prize-step ${cls}`} title={`Level ${level}: ${prize.toLocaleString('de-DE')}€`}>
              {prize >= 1000 ? `${prize / 1000}k` : prize}
            </div>
          );
        })}
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
                <div className="game-over-stats">
                  {t('correct')}: {roundStats.correct}/{roundStats.total} · {t('price_money')}:{' '}
                  {(() => {
                    const myUserId = getSafeStorage('userId');
                    const me = players.find(p => p.userId === myUserId);
                    return me?.score?.toLocaleString('de-DE') ?? '0';
                  })()}€
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
              { type: 'phone', label: t('joker_phone'), Icon: Phone },
              { type: 'switch', label: t('joker_switch'), Icon: RefreshCw }
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

          <div className="question-box" key={currentQuestion.id}>
            <div className="question-meta">
              {currentQuestion.category && <span className="question-meta-badge">{currentQuestion.category}</span>}
              <span className="question-meta-badge">{t('level')}: {currentQuestion.level}</span>
              <span className="question-meta-badge">{t('price_money')}: {currentQuestion.prize?.toLocaleString('de-DE')}€</span>
            </div>
            {(currentQuestion.questionTranslations && currentQuestion.questionTranslations[language])
              ? currentQuestion.questionTranslations[language]
              : currentQuestion.question}

            <div className="emote-overlay" aria-hidden="true">
              {emotes.map(e => (
                <div key={e.id} className="emote-bubble">
                  <span className="emote-char">{e.emote}</span>
                  <span className="emote-name">{getPlayerName(e.userId)}</span>
                </div>
              ))}
            </div>
          </div>

          {answerTimeLeft !== null && (
            <div className={`answer-timer ${answerTimeLeft <= 10 ? 'answer-timer-warning' : ''}`}>
              <Timer size={16} /> {answerTimeLeft}s
            </div>
          )}

          <EmoteBar onEmote={sendEmote} />

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
                <div className="options-grid" key={`opts-${currentQuestion.id}`}>
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
                        onClick={() => { setSelectedAnswer(optionText); playClick(); }}
                        disabled={!isAlive || answerSubmitted || gameData?.status === 'paused' || answerTimeLeft === 0}
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
                    disabled={!selectedAnswer || !isAlive || gameData?.status === 'paused' || answerTimeLeft === 0}
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
              className={`teammate-card ${gameData?.game_mode === 'survival' && p.lives === 0 ? 'dead' : ''} ${offlineUsers.has(p.userId) ? 'offline' : ''}`}
              style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              {/* Avatar Display */}
              <div className="teammate-avatar">
                {p.avatar_url && !isInitialAvatar(p.avatar_url) ? (
                  <img
                    src={p.avatar_url}
                    alt={p.name}
                  />
                ) : (
                  <span
                    className="teammate-avatar-initial"
                    style={getAvatarColor(p.avatar_url) ? { backgroundColor: getAvatarColor(p.avatar_url) as string } : undefined}
                  >
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              {gameData?.game_mode === 'survival' && p.lives === 0 && (
                <div className="teammate-dead-overlay">
                  <Skull size={24} />
                </div>
              )}

              <div className="font-bold">{p.name} {offlineUsers.has(p.userId) && <WifiOff size={13} className="offline-icon" />}</div>
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

      <RoomChat messages={chatMessages} onSend={sendChat} getPlayerName={getPlayerName} />
    </div>
  );
};

export default LobbyPage;