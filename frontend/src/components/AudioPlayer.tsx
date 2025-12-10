import React from 'react';
import { useAudio } from '../context/AudioContext';
import './AudioPlayer.css';

const AudioPlayer: React.FC = () => {
    const { isPlaying, togglePlay, volume, setVolume } = useAudio();

    return (
        <div className="audio-player">
            <button
                className="audio-btn"
                onClick={togglePlay}
                title={isPlaying ? "Pause Music" : "Play Music"}
            >
                {isPlaying ? '⏸️' : '▶️'}
            </button>

            <div className="volume-control">
                <span role="img" aria-label="volume">🔊</span>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="volume-slider"
                />
            </div>
        </div>
    );
};

export default AudioPlayer;
