import React from 'react';
import { Link } from 'react-router-dom';
import './HomePage.css';

const HomePage: React.FC = () => {
    return (
        <div className="home-page">
            <h1>Welcome to Who Wants to be a Millionaire!</h1>
            <p>Choose an option to begin:</p>
            <div className="button-container">
                <Link to="/create-game" className="button">Create New Game</Link>
                <Link to="/join" className="button">Join Game</Link>
            </div>
        </div>
    );
};

export default HomePage;