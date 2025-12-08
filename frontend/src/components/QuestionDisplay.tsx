import React from 'react';
import '../styles/Game.css';

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

const QuestionDisplay: React.FC<QuestionDisplayProps> = ({
    question,
    onSubmit,
    showCorrectAnswer,
    errorMessage,
    onRefresh,
    isHost = false // Default to false (player mode)
}) => {
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

    const handleAnswerClick = (answer: string) => {
        if (!isHost) { // Only submit answers if not the host
            onSubmit(answer);
        }
    };

    return (
        <div className="question-display">
            <h2 className="question-text">{question.question}</h2>
            <div className="options-grid">
                {(question.options || []).map((option, index) => (
                    isHost ? (
                        // For host: render div elements that look like buttons but aren't clickable
                        <div
                            key={index}
                            className="option-button-host"
                        >
                            {option}
                        </div>
                    ) : (
                        // For players: render actual clickable buttons
                        <button key={index} onClick={() => handleAnswerClick(option)} className="option-button-player">
                            {option}
                        </button>
                    )
                ))}
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