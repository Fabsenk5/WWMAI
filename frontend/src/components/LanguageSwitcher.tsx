import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import '../styles/LanguageSwitcher.css';

const flags: Record<string, string> = {
    en: '🇺🇸',
    de: '🇩🇪',
    ru: '🇷🇺',
    es: '🇪🇸'
};

const LanguageSwitcher: React.FC = () => {
    const { language, cycleLanguage } = useLanguage();

    return (
        <button
            className="language-switcher-fab"
            onClick={cycleLanguage}
            title="Switch Language"
        >
            <span className="flag-icon">{flags[language]}</span>
            <span className="lang-code">{language.toUpperCase()}</span>
        </button>
    );
};

export default LanguageSwitcher;
