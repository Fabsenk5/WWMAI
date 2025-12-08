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

const Scoreboard: React.FC<ScoreboardProps> = ({ players, gameEnded }) => {
    return (
        <div className="scoreboard">
            <h2>Scoreboard</h2>
            {gameEnded && <h3>Game Over</h3>}
            <table>
                <thead>
                    <tr>
                        <th>Player</th>
                        <th>Score</th>
                        <th>Lifes</th>
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