import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import '../styles/LanguageSwitcher.css';

const getFlag = (lang: string) => {
    switch (lang) {
        case 'en': return <svg viewBox="0 0 19 10" width="32" height="24"><path fill="#b22234" d="M0 0h19v10H0z" /><path fill="#fff" d="M0 1h19v1H0zM0 3h19v1H0zM0 5h19v1H0zM0 7h19v1H0zM0 9h19v1H0z" /><path fill="#3c3b6e" d="M0 0h8v5H0z" /><g fill="#fff"><circle cx="1" cy="1" r=".5" /><circle cx="3" cy="1" r=".5" /><circle cx="5" cy="1" r=".5" /><circle cx="7" cy="1" r=".5" /><circle cx="2" cy="2" r=".5" /><circle cx="4" cy="2" r=".5" /><circle cx="6" cy="2" r=".5" /><circle cx="1" cy="3" r=".5" /><circle cx="3" cy="3" r=".5" /><circle cx="5" cy="3" r=".5" /><circle cx="7" cy="3" r=".5" /><circle cx="2" cy="4" r=".5" /><circle cx="4" cy="4" r=".5" /><circle cx="6" cy="4" r=".5" /></g></svg>; // Standard US Flag
        case 'de': return <svg viewBox="0 0 5 3" width="32" height="24"><desc>Flag of Germany</desc><rect width="5" height="3" y="0" x="0" fill="#000" /><rect width="5" height="2" y="1" x="0" fill="#D00" /><rect width="5" height="1" y="2" x="0" fill="#FFCE00" /></svg>;
        case 'ru': return <svg viewBox="0 0 9 6" width="32" height="24"><rect width="9" height="6" fill="#fff" /><rect width="9" height="4" y="2" fill="#d52b1e" /><rect width="9" height="2" y="2" fill="#0039a6" /></svg>;
        case 'es': return <svg viewBox="0 0 750 500" width="32" height="24"><rect width="750" height="500" fill="#c60b1e" /><rect width="750" height="250" y="125" fill="#ffc400" /></svg>; // Simplified ES
        default: return null;
    }
};

const LanguageSwitcher: React.FC = () => {
    const { language, cycleLanguage } = useLanguage();

    return (
        <button
            className="language-switcher-fab"
            onClick={cycleLanguage}
            title="Switch Language"
        >
            <span className="flag-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{getFlag(language)}</span>
        </button>
    );
};

export default LanguageSwitcher;
