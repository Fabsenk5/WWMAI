import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import '../styles/LanguageSwitcher.css';

const getFlag = (lang: string) => {
    switch (lang) {
        case 'en': return <svg viewBox="0 0 640 480" width="32" height="24"><path fill="#bd3d44" d="M0 0h640v480H0" /><path stroke="#fff" strokeWidth="37" d="M0 553V-73M640-73v626" /><path stroke="#fff" strokeWidth="37" d="M30 0l580 480M610 0L30 480" /><path stroke="#192f5d" strokeWidth="24" d="M0 553V-73M640-73v626" /><path stroke="#192f5d" strokeWidth="24" d="M30 0l580 480M610 0L30 480" /></svg>; // US-ish placeholder or UK. Let's use standard US flag SVG for simplified generic English
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
