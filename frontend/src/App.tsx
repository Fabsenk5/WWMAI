import React from 'react';
import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import JoinGamePage from './pages/JoinGamePage';
import CreateGamePage from './pages/CreateGamePage';
import GameLobby from './components/GameLobby';
import QuestionDisplay from './components/QuestionDisplay';
import Scoreboard from './components/Scoreboard';
import GamePage from './pages/GamePage';
import LobbyPage from './pages/LobbyPage';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import { GameProvider, useGame } from './context/GameContext';
import './styles/App.css';

import ThemeToggle from './components/ThemeToggle';

const App: React.FC = () => {
  const { questions, currentQuestionIndex, nextQuestion } = useGame();

  return (
    <div className="App">
      <ThemeToggle />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/join" element={<JoinGamePage />} />
        <Route path="/create-game" element={<CreateGamePage />} />
        <Route path="/lobby" element={<GameLobby />} />
        <Route
          path="/question"
          element={
            <QuestionDisplay
              question={questions[currentQuestionIndex] || null}
              onSubmit={(answer: string) => {
                console.log('Answer submitted:', answer);
                nextQuestion();
              }}
            />
          }
        />
        <Route
          path="/scoreboard"
          element={
            <Scoreboard
              players={[
                { name: 'Player 1', score: 100, lives: 3 },
                { name: 'Player 2', score: 80, lives: 2 },
              ]}
              gameEnded={false} // Added the missing gameEnded prop
            />
          }
        />
        <Route path="/game/:id" element={<GamePage />} />
        <Route path="/lobby/:roomCode" element={<LobbyPage />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
      </Routes>
    </div>
  );
};

export default App;