import React from 'react';
import '../styles/Game.css';
import { useLanguage } from '../context/LanguageContext';

interface Question {
    question: string;
    options: string[];
    correctAnswer: string;
}

interface QuestionDisplayProps {
    question: Question | null;
    onSubmit: (answer: string) => void;
    showCorrectAnswer?: boolean;
    errorMessage?: string; // Add error message prop
    onRefresh?: () => void; // Add refresh callback prop
    isHost?: boolean; // Add flag to indicate if the viewer is the host/operator
}



// ... (interfaces)

const QuestionDisplay: React.FC<QuestionDisplayProps> = ({
    question,
    onSubmit,
    showCorrectAnswer,
    errorMessage,
    onRefresh,
    isHost = false
}) => {
    const { language } = useLanguage();

    if (errorMessage) {
        return (
            <div className="error-message">
                <h3>Error</h3>
                <p>{errorMessage}</p>
                {onRefresh && (
                    <button onClick={onRefresh} className="button refresh-button">
                        Refresh Question
                    </button>
                )}
            </div>
        );
    }

    if (!question) {
        return (
            <div className="loading-message">
                <p>Loading question...</p>
                <p className="text-secondary" style={{ fontSize: '0.9em' }}>If you're seeing this message for a long time, there might be an issue with the game state.</p>
                {onRefresh && (
                    <button onClick={onRefresh} className="button refresh-button">
                        Refresh Question
                    </button>
                )}
            </div>
        );
    }

    // Determine Question Text
    // The backend now sends questionTranslations { en: "...", de: "..." }
    // We cast question to any to access dynamic props not yet in interface
    const q: any = question;
    const displayText = (q.questionTranslations && q.questionTranslations[language])
        ? q.questionTranslations[language]
        : q.question;

    const handleAnswerClick = (answerEn: string) => {
        if (!isHost) {
            onSubmit(answerEn);
        }
    };

    return (
        <div className="question-display">
            <h2 className="question-text">{displayText}</h2>
            <div className="options-grid">
                {(question.options || []).map((option: any, index: number) => {
                    // Option can be string (legacy) or object { text, translations }
                    const isLegacy = typeof option === 'string';
                    const optionEn = isLegacy ? option : option.text;
                    const optionDisplay = isLegacy
                        ? option
                        : (option.translations && option.translations[language] ? option.translations[language] : option.text);

                    return isHost ? (
                        <div key={index} className="option-button-host">
                            {optionDisplay}
                        </div>
                    ) : (
                        <button key={index} onClick={() => handleAnswerClick(optionEn)} className="option-button-player">
                            {optionDisplay}
                        </button>
                    );
                })}
            </div>
            {showCorrectAnswer && question.correctAnswer && (
                <div className="correct-answer-banner">
                    <p><strong>Correct Answer:</strong> {question.correctAnswer}</p>
                </div>
            )}
            {isHost && (
                <div className="host-note-banner">
                    <p><strong>Host Mode:</strong> You are viewing this question as the game host. Options are not clickable.</p>
                </div>
            )}
        </div>
    );
};

export default QuestionDisplay;