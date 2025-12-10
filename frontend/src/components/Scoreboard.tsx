import React from 'react';

interface PlayerScore {
    name: string;
    score: number;
    lives: number;
}

interface ScoreboardProps {
    players: PlayerScore[];
    gameEnded: boolean;
}

import { useTranslation } from 'react-i18next';

// ... interfaces

const Scoreboard: React.FC<ScoreboardProps> = ({ players, gameEnded }) => {
    const { t } = useTranslation();

    return (
        <div className="scoreboard">
            <h2>{t('score')}</h2>
            {gameEnded && <h3>{t('game_over')}</h3>}
            <table>
                <thead>
                    <tr>
                        <th>{t('player')}</th>
                        <th>{t('score')}</th>
                        <th>{t('lives')}</th>
                    </tr>
                </thead>
                <tbody>
                    {players.map((player, index) => (
                        <tr key={index}>
                            <td>{player.name}</td>
                            <td>{player.score}</td>
                            <td>{player.lives}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default Scoreboard;