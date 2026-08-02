import React from 'react';
import { Globe } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import '../styles/LanguageSwitcher.css';

const LanguageSwitcher: React.FC = () => {
    const { language, cycleLanguage } = useLanguage();

    return (
        <button
            className="language-switcher-fab"
            onClick={cycleLanguage}
            title="Switch Language"
        >
            <Globe size={18} className="globe-icon" />
            <span className="lang-code">{language.toUpperCase()}</span>
        </button>
    );
};

export default LanguageSwitcher;
