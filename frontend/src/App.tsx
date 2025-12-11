import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import './styles/App.css';
import HomePage from './pages/HomePage';
import CreateGamePage from './pages/CreateGamePage';
import JoinGamePage from './pages/JoinGamePage';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProfilePage from './pages/ProfilePage';
import UpgradePage from './pages/UpgradePage'; // Import UpgradePage
import FeatureWishlist from './pages/FeatureWishlist'; // Import FeatureWishlist
import { ModalProvider } from './context/ModalContext';
import { AudioProvider } from './context/AudioContext';
import AudioPlayer from './components/AudioPlayer';
import { LanguageProvider } from './context/LanguageContext';
import LanguageSwitcher from './components/LanguageSwitcher';

import ProtectedRoute from './components/ProtectedRoute';

import UserIcon from './components/UserIcon';
import Branding from './components/Branding';
import ThemeToggle from './components/ThemeToggle';

function App() {
  return (
    <ModalProvider>
      <AudioProvider>
        <LanguageProvider>
          <div className="App">
            <AudioPlayer />
            <UserIcon />
            <LanguageSwitcher />
            <Branding />
            <ThemeToggle />
            <div className="main-content">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/create-game" element={<CreateGamePage />} />
                <Route path="/join" element={<JoinGamePage />} />
                <Route path="/lobby/:roomCode" element={<LobbyPage />} />
                <Route path="/game/:id" element={<GamePage />} />

                {/* Auth Routes */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/upgrade" element={<UpgradePage />} />
                <Route path="/feature-wishlist" element={<FeatureWishlist />} />

                {/* Admin Routes */}
                <Route path="/admin" element={<AdminLogin />} />
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
              </Routes>
            </div>
          </div>
        </LanguageProvider>
      </AudioProvider>
    </ModalProvider>
  );
}

export default App;