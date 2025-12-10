import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

interface AudioContextType {
    isPlaying: boolean;
    volume: number;
    togglePlay: () => void;
    setVolume: (vol: number) => void;
    currentTrack: string;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolumeState] = useState(0.5);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [currentTrack] = useState('/assets/audio/background_loop.mp3');

    // Initialize audio element
    useEffect(() => {
        audioRef.current = new Audio(currentTrack);
        audioRef.current.loop = true;

        // Load persisted volume
        const savedVolume = localStorage.getItem('wwmai_bgm_volume');
        if (savedVolume) {
            const vol = parseFloat(savedVolume);
            setVolumeState(vol);
            audioRef.current.volume = vol;
        } else {
            audioRef.current.volume = 0.5;
        }

        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    const togglePlay = () => {
        if (!audioRef.current) return;

        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            audioRef.current.play().catch(err => console.log("Auto-play prevented:", err));
            setIsPlaying(true);
        }
    };

    const setVolume = (vol: number) => {
        if (!audioRef.current) return;
        const clamped = Math.max(0, Math.min(1, vol));
        setVolumeState(clamped);
        audioRef.current.volume = clamped;
        localStorage.setItem('wwmai_bgm_volume', clamped.toString());
    };

    return (
        <AudioContext.Provider value={{ isPlaying, volume, togglePlay, setVolume, currentTrack }}>
            {children}
        </AudioContext.Provider>
    );
};

export const useAudio = () => {
    const context = useContext(AudioContext);
    if (!context) throw new Error('useAudio must be used within AudioProvider');
    return context;
};
