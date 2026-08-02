import React from 'react';
import { Play, Pause, Volume2, Volume1, VolumeX } from 'lucide-react';
import { useAudio } from '../context/AudioContext';
import './AudioPlayer.css';

const AudioPlayer: React.FC = () => {
    const { isPlaying, togglePlay, volume, setVolume, isMuted, toggleMute } = useAudio();

    const getVolumeIcon = () => {
        if (isMuted || volume === 0) return <VolumeX size={18} />;
        if (volume < 0.5) return <Volume1 size={18} />;
        return <Volume2 size={18} />;
    };

    return (
        <div className="audio-player">
            <button
                className="audio-btn"
                onClick={togglePlay}
                title={isPlaying ? "Pause Music" : "Play Music"}
            >
                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
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
