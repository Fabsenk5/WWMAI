import React from 'react';
import { useTranslation } from 'react-i18next';
import '../styles/Game.css';

interface PlayerScore {
    name: string;
    score: number;
    lives: number;
}

interface ScoreboardProps {
    players: PlayerScore[];
    gameEnded: boolean;
}



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
                            <td>
                                <span className="scoreboard-name">
                                    <span className="scoreboard-avatar">{player.name.charAt(0).toUpperCase()}</span>
                                    {player.name}
                                </span>
                            </td>
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