import React, { useEffect, useState, useContext, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { GameContext, Question, User } from '../context/GameContext';
import QuestionDisplay from '../components/QuestionDisplay';
import Scoreboard from '../components/Scoreboard';
import io from 'socket.io-client'; // Import socket.io-client

const GamePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  console.log(`[GamePage] Mounted. ID from URL: ${id}`);

  const {
    gameData,
    fetchGameData,
    submitAnswer,
    loading,
    error,
    setGameData // Ensure setGameData is available from context
  } = useContext(GameContext)!;

  const [gameEnded, setGameEnded] = useState(false);
  // currentQuestion state will hold the question object including correctAnswer for the host
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [answerSubmitted, setAnswerSubmitted] = useState(false);
  const [questionError, setQuestionError] = useState<string | undefined>(undefined); // Add state for question errors
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  // No longer need roomCodeRef, derive directly from gameData
  const roomCode = gameData?.room_code;

  // --- Effect 1: Fetch initial game data ---
  useEffect(() => {
    console.log(`[GamePage] Effect 1: fetchGameData triggered. ID: ${id}`);
    if (id) {
      console.log(`[GamePage] Effect 1: Calling fetchGameData with ID: ${id}`);
      fetchGameData(id);
    }
    // No cleanup needed here
  }, [id, fetchGameData]); // fetchGameData is stable via useCallback

  // --- Effect 2: Fetch current question (if game started) ---
  useEffect(() => {
    const fetchCurrentQuestion = async () => {
      // Only fetch if game is started and roomCode is available
      if (roomCode && gameData?.status === 'started') {
        console.log(`[GamePage] Effect 2: Fetching current question for room ${roomCode}`);
        try {
          // Include userId for personalized responses if available
          const userId = localStorage.getItem('userId');
          const userIdParam = userId ? `?userId=${userId}` : '';
          const response = await fetch(`/api/games/${roomCode}/current-question${userIdParam}`);

          if (!response.ok) {
            throw new Error('Failed to fetch the current question');
          }

          const questionData = await response.json();
          console.log(`[GamePage] Effect 2: Received question data:`, questionData);

          // Handle error state from the backend
          if (questionData.error === true && questionData.message) {
            console.log(`[GamePage] Effect 2: Received error message: ${questionData.message}`);
            setQuestionError(questionData.message);
            setCurrentQuestion(null);
            return;
          }

          // Reset error state if we have a valid question
          setQuestionError(undefined);

          // Only update if we have valid question data
          if (questionData && (questionData.id || questionData.question)) {
            console.log(`[GamePage] Effect 2: Setting current question state with valid question`);
            setCurrentQuestion(questionData);
          } else if (questionData.message) {
            // Log diagnostic message but don't update state
            console.log(`[GamePage] Effect 2: Received message instead of question: ${questionData.message}`);
            // Set as error if we don't have a question
            setQuestionError(questionData.message);
          }
        } catch (err) {
          console.error('Error fetching current question:', err);
          setQuestionError('Failed to fetch the current question. Please try refreshing.');
        }
      } else {
        console.log(`[GamePage] Effect 2: Skipping fetch current question (Room: ${roomCode}, Status: ${gameData?.status})`);
      }
    };

    fetchCurrentQuestion();
    // Depend on roomCode, game status, and CURRENT LEVEL to trigger fetch on level change
  }, [roomCode, gameData?.status, gameData?.current_level]);

  // --- Effect 3: Setup WebSocket connection ---
  useEffect(() => {
    // Only run if roomCode is available AND socket isn't already set up
    if (roomCode && !socketRef.current) {
      console.log(`[GamePage] Effect 3: Initializing WebSocket connection for room: ${roomCode}`);

      const socket = io('http://localhost:5000');
      socketRef.current = socket; // Store the instance

      socket.on('connect', () => {
        console.log('[GamePage] Effect 3: WebSocket Connected. Attempting to join room...');
        const currentUserId = localStorage.getItem('userId');
        if (currentUserId && roomCode) { // roomCode is stable within this effect run
          console.log(`[GamePage] Effect 3: Emitting joinRoom with RoomCode: ${roomCode}, UserId: ${currentUserId}`);
          socket.emit('joinRoom', { roomCode: roomCode, userId: currentUserId });
        } else {
          console.error(`[GamePage] Effect 3: Cannot join room. Missing data: ${!currentUserId ? 'UserId' : ''} ${!roomCode ? 'RoomCode' : ''}`);
        }
      });

      socket.on('gameEnded', () => {
        console.log('[GamePage] Effect 3: Received gameEnded event');
        setGameEnded(true);
      });

      // Add handler for when all answers are revealed
      socket.on('revealAnswers', (data) => {
        console.log('[GamePage] Effect 3: Received revealAnswers event:', data);

        // Update player scores and lives if provided
        if (data.playerAnswers && setGameData) {
          // First fetch the latest player data since the socket might not include full player info
          fetch(`/api/games/${roomCode}/players`)
            .then(response => {
              if (!response.ok) {
                throw new Error('Failed to fetch updated player data');
              }
              return response.json();
            })
            .then(players => {
              console.log('[GamePage] Effect 3: Fetched updated player data after revealAnswers:', players);

              // Force a deeper state update to ensure React detects changes
              setGameData(prevData => {
                if (prevData) {
                  // Create a new object with the updated players
                  const updatedData = {
                    ...prevData,
                    users: players.map((player: User) => ({ ...player })) // Create new player objects to ensure state change detection
                  };
                  console.log('[GamePage] Effect 3: Updating game data with new player info:', updatedData.users);
                  return updatedData;
                }
                return prevData;
              });
            })
            .catch(err => {
              console.error('[GamePage] Effect 3: Error fetching players after revealAnswers:', err);
            });
        }
      });

      // Handle new question
      socket.on('newQuestion', (data: Question) => {
        console.log('[GamePage] Effect 3: Received newQuestion event:', data);
        setCurrentQuestion(data);
        setAnswerSubmitted(false); // Reset host answer state if applicable
        setQuestionError(undefined); // Clear any previous errors

        if (setGameData) {
          setGameData(prev => {
            if (!prev) return null;
            // Update level and status
            // If data has a level property, use it.
            // Note: The Question interface might not have 'level' strictly typed in all contexts, but the payload has it.
            // We cast or check if it exists.
            const newLevel = (data as any).level || prev.current_level;
            return {
              ...prev,
              current_level: newLevel,
              status: 'started'
            };
          });
        }
      });

      // Handle user joined for Admin view
      socket.on('userJoined', (data) => {
        console.log('[GamePage] Effect 3: Received userJoined event:', data);
        // Reuse fetch logic or just trigger a re-fetch if we have a function suitable,
        // but Effect 4 polls anyway. To be instant, we can try to fetch immediately.
        fetch(`/api/games/${roomCode}/players`)
          .then(res => res.json())
          .then(players => {
            if (setGameData) {
              setGameData(prev => prev ? ({ ...prev, users: players }) : prev);
            }
          })
          .catch(err => console.error('Failed to update players list on userJoined:', err));
      });

      socket.on('disconnect', (reason) => {
        console.log(`[GamePage] Effect 3: WebSocket disconnected. Reason: ${reason}`);
        // Optional: Handle specific disconnect reasons if needed
      });
      socket.on('connect_error', (err) => {
        console.error('[GamePage] Effect 3: WebSocket connection error:', err);
      });

      // Cleanup function for THIS effect runs ONLY on unmount or if roomCode changes
      return () => {
        if (socketRef.current) {
          console.log(`[GamePage] Effect 3: Cleaning up WebSocket connection (unmount/roomCode change).`);
          socketRef.current.disconnect();
          socketRef.current = null;
        }
      };
    } else {
      console.log(`[GamePage] Effect 3: Skipping WebSocket setup (Room: ${roomCode}, Socket Exists: ${!!socketRef.current})`);
    }
    // Depend ONLY on roomCode.
  }, [roomCode, setGameData]);


  // --- Effect 4: Poll for players ---
  useEffect(() => {
    const fetchPlayers = async () => {
      // Use derived roomCode variable
      if (roomCode) {
        console.log(`[GamePage] Effect 4: Polling for players in room ${roomCode}...`);
        try {
          const response = await fetch(`/api/games/${roomCode}/players`);
          if (!response.ok) {
            throw new Error('Failed to fetch players during poll');
          }
          const players = await response.json();
          console.log('[GamePage] Effect 4: Poll received players:', players);

          setGameData(prevData => {
            if (prevData && JSON.stringify(prevData.users) !== JSON.stringify(players)) { // Only update if players actually changed
              console.log('[GamePage] Effect 4: Updating players in gameData state via poll');
              return { ...prevData, users: players };
            }
            // If no change or no prevData, return prevData to avoid unnecessary re-render trigger
            return prevData;
          });

        } catch (err) {
          console.error('[GamePage] Effect 4: Error polling players:', err);
        }
      } else {
        console.log('[GamePage] Effect 4: Skipping player poll: roomCode not available');
      }
    };

    let intervalId: NodeJS.Timeout | null = null;
    if (roomCode) {
      console.log('[GamePage] Effect 4: Starting player poll interval');
      // Optionally run immediately once then start interval
      fetchPlayers();
      intervalId = setInterval(fetchPlayers, 5000);
    } else {
      console.log('[GamePage] Effect 4: Delaying player poll start until roomCode is available');
    }

    // Cleanup interval on unmount or when roomCode changes
    return () => {
      if (intervalId) {
        console.log('[GamePage] Effect 4: Clearing player poll interval');
        clearInterval(intervalId);
      }
    };
    // Depend on roomCode availability and the stable setGameData function
  }, [roomCode, setGameData]);

  const handleAnswerSubmit = async (answer: string) => {
    // Use derived roomCode variable
    if (currentQuestion && roomCode) {
      try {
        await submitAnswer(roomCode, currentQuestion.id.toString(), answer);
        setAnswerSubmitted(true); // Mark answer as submitted

        // Fetch latest player data to ensure the scoreboard is updated
        try {
          const response = await fetch(`/api/games/${roomCode}/players`);
          if (response.ok) {
            const players = await response.json();
            console.log('[GamePage] Fetched updated player data after answer submission:', players);
            setGameData(prevData => {
              if (prevData) {
                return { ...prevData, users: players };
              }
              return prevData;
            });
          }
        } catch (err) {
          console.error('[GamePage] Error fetching players after answer submission:', err);
        }
      } catch (error) {
        console.error('Failed to submit answer:', error);
      }
    }
  };

  const startGame = async () => {
    if (roomCode) {
      try {
        const response = await fetch(`/api/games/${roomCode}/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to start the game');
        }
        const data = await response.json();
        // The backend now sends firstQuestion with correctAnswer for the host
        setCurrentQuestion(data.firstQuestion);
        // Update gameData in context to reflect game has started
        if (setGameData) {
          setGameData(prev => prev ? ({ ...prev, status: 'started', current_level: 1 }) : null);
        }
      } catch (err) {
        console.error('Error starting the game:', err);
        // Optionally set an error state to display to the user
      }
    }
  };

  // Create a reusable function to fetch questions
  const refreshQuestion = async () => {
    console.log('[GamePage] Manual question refresh triggered');
    if (roomCode) {
      try {
        const userId = localStorage.getItem('userId');
        const userIdParam = userId ? `?userId=${userId}` : '';
        const response = await fetch(`/api/games/${roomCode}/current-question${userIdParam}`);

        if (response.ok) {
          const data = await response.json();
          console.log('[GamePage] Manual refresh received data:', data);

          // Handle error state from the backend
          if (data.error === true && data.message) {
            console.log(`[GamePage] Manual refresh received error message: ${data.message}`);
            setQuestionError(data.message);
            setCurrentQuestion(null);
            return;
          }

          // Reset error state if we have a valid question
          setQuestionError(undefined);

          if (data && (data.id || data.question)) {
            setCurrentQuestion(data);
          } else if (data.message) {
            setQuestionError(data.message);
          }
        } else {
          setQuestionError('Failed to refresh the question. Please try again.');
        }
      } catch (err) {
        console.error('[GamePage] Manual refresh error:', err);
        setQuestionError('Error refreshing question. Please try again.');
      }
    }
  };

  if (loading) {
    console.log('[GamePage] Rendering Loading state.');
    return <div>Loading game data...</div>;
  }

  if (error) {
    console.error('[GamePage] Rendering Error state:', error);
    return <div className="error-message">Error loading game: {error}</div>;
  }

  if (!gameData) {
    console.log('[GamePage] Rendering Game data not found state.');
    return <div>Game data not found.</div>;
  }

  // Use answerSubmitted to conditionally render UI
  if (answerSubmitted) {
    return <div>Answer submitted. Waiting for other players...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>Game Page</h1>
        <div style={{ fontSize: '1.2em' }}>
          <span style={{ marginRight: '15px', fontWeight: 'bold' }}>
            Mode: {gameData?.game_mode === 'survival' ? '🔥 Survival' : '🤝 Cooperative'}
          </span>
          <span>Game ID: {id}</span>
        </div>
      </div>
      <div>
        <p>Room Code: <span style={{ fontWeight: 'bold' }}>{roomCode}</span></p>
        <p>Current Level: {gameData?.current_level}</p>
      </div>

      {gameEnded ? (
        <h2>Game Over</h2>
      ) : gameData?.status !== 'started' ? (
        <>
          <button onClick={startGame}>Start Game</button>
        </>
      ) : (
        // Use the updated QuestionDisplay component with error handling
        <QuestionDisplay
          question={currentQuestion}
          onSubmit={handleAnswerSubmit}
          showCorrectAnswer={true}
          errorMessage={questionError}
          onRefresh={refreshQuestion}
          isHost={true} // This is the host/operator view, so disable clicking options
        />
      )}

      <Scoreboard players={gameData?.users || []} gameEnded={gameEnded} />
    </div>
  );
};

export default GamePage;