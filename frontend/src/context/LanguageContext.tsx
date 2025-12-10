import React, { createContext, useContext, useState, useEffect } from 'react';
import i18n from '../i18n';

type Language = 'en' | 'de' | 'ru' | 'es';

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    cycleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [language, setLanguageState] = useState<Language>(() => {
        const saved = localStorage.getItem('i18nextLng');
        return (saved as Language) || 'en';
    });

    useEffect(() => {
        i18n.changeLanguage(language);
        localStorage.setItem('i18nextLng', language);
    }, [language]);

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
    };

    const cycleLanguage = () => {
        setLanguageState(prev => {
            const order: Language[] = ['en', 'de', 'ru', 'es'];
            const currentIndex = order.indexOf(prev);
            const nextIndex = (currentIndex + 1) % order.length;
            return order[nextIndex];
        });
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, cycleLanguage }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};
