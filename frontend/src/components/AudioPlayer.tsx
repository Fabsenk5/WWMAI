import React from 'react';
import { useAudio } from '../context/AudioContext';
import './AudioPlayer.css';

const AudioPlayer: React.FC = () => {
    const { isPlaying, togglePlay, volume, setVolume, isMuted, toggleMute } = useAudio();

    const getVolumeIcon = () => {
        if (isMuted || volume === 0) return '🔇';
        if (volume < 0.5) return '🔉';
        return '🔊';
    };

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
                <button
                    className="volume-btn"
                    onClick={toggleMute}
                    title={isMuted ? "Unmute" : "Mute"}
                >
                    {getVolumeIcon()}
                </button>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="volume-slider"
                />
            </div>
        </div>
    );
};

export default AudioPlayer;
