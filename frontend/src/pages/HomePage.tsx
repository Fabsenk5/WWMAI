import React from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users } from 'lucide-react';
import './HomePage.css';

import { useTranslation } from 'react-i18next';

const HomePage: React.FC = () => {
    const { t } = useTranslation();

    return (
        <div className="home-page">
            <div className="hero-orb hero-orb-1" aria-hidden="true" />
            <div className="hero-orb hero-orb-2" aria-hidden="true" />
            <div className="hero-orb hero-orb-3" aria-hidden="true" />
            <div className="home-hero">
                <h1 className="hero-title">{t('welcome_message')}</h1>
                <div className="hero-underline" aria-hidden="true" />
                <p className="hero-subtitle">{t('choose_option')}</p>
                <div className="button-container">
                    <Link to="/create-game" className="button hero-cta">
                        <Plus size={20} />
                        {t('create_game')}
                    </Link>
                    <Link to="/join" className="button button-secondary hero-cta">
                        <Users size={20} />
                        {t('join_game')}
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default HomePage;
