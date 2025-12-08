import React from 'react';
import ReactDOM from 'react-dom/client'; // Updated import
import App from './App';
import './styles/App.css';
import { GameProvider } from './context/GameContext';
import { BrowserRouter } from 'react-router-dom';

// Get the root element
const rootElement = document.getElementById('root') as HTMLElement;

// Create a root
const root = ReactDOM.createRoot(rootElement);

// Render the app
root.render(
    <React.StrictMode>
        <BrowserRouter>
            <GameProvider>
                <App />
            </GameProvider>
        </BrowserRouter>
    </React.StrictMode>
);