import React from 'react';
import { Link } from 'react-router-dom';
import './HomePage.css';

import { useTranslation } from 'react-i18next';

const HomePage: React.FC = () => {
    const { t } = useTranslation();

    return (
        <div className="home-page">
            <h1>{t('welcome_message')}</h1>
            <p>{t('choose_option')}</p>
            <div className="button-container">
                <Link to="/create-game" className="button">{t('create_game')}</Link>
                <Link to="/join" className="button">{t('join_game')}</Link>
            </div>
        </div>
    );
};

export default HomePage;