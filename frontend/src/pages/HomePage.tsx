import React from 'react';
import { Link } from 'react-router-dom';
import './HomePage.css';

const HomePage: React.FC = () => {
    return (
        <div className="home-page">
            <h1>Willkommen bei Wer wird Millionär!</h1>
            <p>Wählen Sie eine Option, um zu beginnen:</p>
            <div className="button-container">
                <Link to="/create-game" className="button">Neues Spiel erstellen</Link>
                <Link to="/join" className="button">Spiel beitreten</Link>
            </div>
        </div>
    );
};

export default HomePage;