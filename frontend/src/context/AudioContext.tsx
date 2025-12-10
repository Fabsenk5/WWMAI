import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

interface AudioContextType {
    isPlaying: boolean;
    volume: number;
    togglePlay: () => void;
    setVolume: (vol: number) => void;
    isMuted: boolean;
    toggleMute: () => void;
    currentTrack: string;
    playTrack: (trackName: string, loop?: boolean) => void;
    playSFX: (trackName: string) => void;
    stopAll: () => void;
    getAudioForLevel: (level: number, type: 'question' | 'final_answer' | 'win' | 'lose') => string;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolumeState] = useState(0.5);
    const [isMuted, setIsMuted] = useState(false); // Add mute state
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [currentTrack] = useState('/assets/audio/background_loop.mp3');

    // Master volume multiplier to reduce overall loudness
    const MASTER_VOLUME = 0.5;

    // Initialize audio element
    useEffect(() => {
        // Default startup track
        playTrack('01 Main Theme.mp3', true);

        return () => {
            stopAll();
        };
    }, []);

    // Load persisted volume only once on mount
    useEffect(() => {
        const savedVolume = localStorage.getItem('wwmai_bgm_volume');
        if (savedVolume) {
            setVolumeState(parseFloat(savedVolume));
        }
    }, []);

    // Sync volume to active track
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = isMuted ? 0 : (volume * MASTER_VOLUME);
        }
    }, [volume, isMuted]);

    const playTrack = (trackName: string, loop: boolean = true) => {
        try {
            if (audioRef.current) {
                audioRef.current.pause();
            }
            const path = `/assets/audio/${trackName}`;
            const audio = new Audio(path);
            audio.loop = loop;
            audio.volume = isMuted ? 0 : (volume * MASTER_VOLUME);
            audio.play().catch(e => console.warn(`[Audio] Failed to play track ${trackName}:`, e));
            audioRef.current = audio;
            setIsPlaying(true);
        } catch (err) {
            console.error('[Audio] Error in playTrack:', err);
        }
    };

    const playSFX = (trackName: string) => {
        try {
            const path = `/assets/audio/${trackName}`;
            const audio = new Audio(path);
            audio.loop = false;
            audio.volume = isMuted ? 0 : (volume * MASTER_VOLUME); // Use global volume
            audio.play().catch(e => console.warn(`[Audio] Failed to play SFX ${trackName}:`, e));
        } catch (err) {
            console.error('[Audio] Error in playSFX:', err);
        }
    };

    const stopAll = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
            setIsPlaying(false);
        }
    };

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

    const toggleMute = () => {
        setIsMuted(prev => !prev);
    };

    const setVolume = (vol: number) => {
        const clamped = Math.max(0, Math.min(1, vol));
        setVolumeState(clamped);
        // Note: Actual volume setting on audio element happens in useEffect
        localStorage.setItem('wwmai_bgm_volume', clamped.toString());

        // If user drags slider, ensuring we unmute if it was muted might be desired, 
        // but for now keeping them separate as requested (toggle icon).
        // Optionally: if (isMuted && vol > 0) setIsMuted(false); 
    };

    const getAudioForLevel = (level: number, type: 'question' | 'final_answer' | 'win' | 'lose'): string => {
        // --- Questions (Loops) ---
        if (type === 'question') {
            if (level <= 5) return '11 $100-$1,000 Questions.mp3';
            if (level === 6) return '14 $2,000 Question.mp3';
            if (level === 7) return '19 $4,000 Question.mp3';
            if (level === 8) return '24 $8,000 Question.mp3';
            if (level === 9) return '29 $16,000 Question.mp3';
            if (level === 10) return '34 $32,000 Question.mp3';
            if (level === 11) return '39 $64,000 Question.mp3';
            if (level === 12) return '44 $125,000 Question.mp3';
            if (level === 13) return '49 $250,000 Question.mp3';
            if (level === 14) return '54 $500,000 Question.mp3';
            if (level === 15) return '59 $1,000,000 Question.mp3';
            return '11 $100-$1,000 Questions.mp3'; // Fallback
        }

        // --- Final Answer Sounds ---
        if (type === 'final_answer') {
            if (level <= 5) return '08 Four Answers in Order.mp3'; // Fallback
            if (level === 6) return '15 $2,000 Final Answer-.mp3';
            if (level === 7) return '20 $4,000 Final Answer-.mp3';
            if (level === 8) return '25 $8,000 Final Answer-.mp3';
            if (level === 9) return '30 $16,000 Final Answer-.mp3';
            if (level === 10) return '35 $32,000 Final Answer-.mp3';
            if (level === 11) return '40 $64,000 Final Answer-.mp3';
            if (level === 12) return '45 $125,000 Final Answer-.mp3';
            if (level === 13) return '50 $250,000 Final Answer-.mp3';
            if (level === 14) return '55 $500,000 Final Answer-.mp3';
            if (level === 15) return '60 $1,000,000 Final Answer-.mp3';
            return '07 Fastest Finger First.mp3'; // Generic Fallback
        }

        // --- Win Sounds ---
        if (type === 'win') {
            if (level <= 4) return '12 Win $1,000.mp3'; // Short win
            if (level === 5) return '12 Win $1,000.mp3'; // Milestone
            if (level === 6) return '17 $2,000 Win.mp3';
            if (level === 7) return '22 $4,000 Win.mp3';
            if (level === 8) return '27 $8,000 Win.mp3';
            if (level === 9) return '32 $16,000 Win.mp3';
            if (level === 10) return '37 $32,000 Win.mp3'; // Milestone
            if (level === 11) return '42 $64,000 Win.mp3';
            if (level === 12) return '47 $125,000 Win.mp3';
            if (level === 13) return '52 $250,000 Win.mp3';
            if (level === 14) return '57 $500,000 Win.mp3';
            if (level === 15) return '62 $1,000,000 Win.mp3'; // Big Win
            return '12 Win $1,000.mp3';
        }

        // --- Lose Sounds ---
        if (type === 'lose') {
            if (level <= 5) return '16 $2,000 Lose.mp3'; // Use 2k lose as generic short lose? Or '09 Who's Was Correct-'? Lets use 2k lose.
            if (level === 6) return '16 $2,000 Lose.mp3';
            if (level === 7) return '21 $4,000 Lose.mp3';
            if (level === 8) return '26 $8,000 Lose.mp3';
            if (level === 9) return '31 $16,000 Lose.mp3';
            if (level === 10) return '36 $32,000 Lose.mp3';
            if (level === 11) return '41 $64,000 Lose.mp3';
            if (level === 12) return '46 $125,000 Lose.mp3';
            if (level === 13) return '51 $250,000 Lose.mp3';
            if (level === 14) return '56 $500,000 Lose.mp3';
            if (level === 15) return '61 $1,000,000 Lose.mp3';
            return '16 $2,000 Lose.mp3';
        }

        return '01 Main Theme.mp3';
    };

    return (
        <AudioContext.Provider value={{ isPlaying, volume, togglePlay, setVolume, isMuted, toggleMute, currentTrack, playTrack, playSFX, stopAll, getAudioForLevel }}>
            {children}
        </AudioContext.Provider>
    );
};

export const useAudio = () => {
    const context = useContext(AudioContext);
    if (!context) throw new Error('useAudio must be used within AudioProvider');
    return context;
};
