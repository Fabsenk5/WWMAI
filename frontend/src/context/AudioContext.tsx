import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

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
    const [volume, setVolumeState] = useState(() => {
        const saved = localStorage.getItem('wwmai_bgm_volume');
        return saved ? parseFloat(saved) : 0.1; // Default 10%
    });
    const [isMuted, setIsMuted] = useState(false); // Add mute state
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const sfxRef = useRef<HTMLAudioElement[]>([]); // running SFX elements (stopped on stopAll/new SFX)
    const [currentTrack] = useState('/assets/audio/background_loop.mp3');

    // Refs for stable access in callbacks
    const volumeRef = useRef(volume);
    const isMutedRef = useRef(isMuted);

    // Sync refs with state
    useEffect(() => {
        volumeRef.current = volume;
    }, [volume]);

    useEffect(() => {
        isMutedRef.current = isMuted;
    }, [isMuted]);

    // Master volume multiplier to reduce overall loudness
    const MASTER_VOLUME = 0.5;

    // Initialize audio element
    useEffect(() => {
        // Default startup track
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        playTrack('01 Main Theme.mp3', true);

        return () => {
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            stopAll();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync volume to active track
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = isMuted ? 0 : (volume * MASTER_VOLUME);
        }
    }, [volume, isMuted]);

    const stopAll = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        // Also stop any running SFX so they cannot overlap the next track
        sfxRef.current.forEach(a => {
            try { a.pause(); } catch { /* noop */ }
        });
        sfxRef.current = [];
        setIsPlaying(false);
    }, []);

    const playTrack = useCallback((trackName: string, loop: boolean = true) => {
        try {
            if (audioRef.current) {
                audioRef.current.pause();
            }
            const path = `/assets/audio/${trackName}`;
            const audio = new Audio(path);
            audio.loop = loop;
            audio.volume = isMutedRef.current ? 0 : (volumeRef.current * MASTER_VOLUME);
            audioRef.current = audio;
            const playPromise = audio.play();
            setIsPlaying(true);
            // Autoplay can be rejected (browser policy) — only report playing on success
            if (playPromise) {
                playPromise.catch(e => {
                    console.warn(`[Audio] Failed to play track ${trackName}:`, e);
                    setIsPlaying(false);
                });
            }
        } catch (err) {
            console.error('[Audio] Error in playTrack:', err);
        }
    }, []);

    const playSFX = useCallback((trackName: string) => {
        try {
            // Stop any running SFX first so round sounds never overlap
            sfxRef.current.forEach(a => {
                try { a.pause(); } catch { /* noop */ }
            });
            sfxRef.current = [];

            const path = `/assets/audio/${trackName}`;
            const audio = new Audio(path);
            audio.loop = false;
            audio.volume = isMutedRef.current ? 0 : (volumeRef.current * MASTER_VOLUME); // Use global volume
            sfxRef.current.push(audio);
            audio.addEventListener('ended', () => {
                sfxRef.current = sfxRef.current.filter(a => a !== audio);
            });
            const playPromise = audio.play();
            if (playPromise) {
                playPromise.catch(e => console.warn(`[Audio] Failed to play SFX ${trackName}:`, e));
            }
        } catch (err) {
            console.error('[Audio] Error in playSFX:', err);
        }
    }, []);

    const togglePlay = useCallback(() => {
        // No track yet (e.g. autoplay was blocked on mount): start the main theme
        if (!audioRef.current) {
            playTrack('01 Main Theme.mp3', true);
            return;
        }

        if (!audioRef.current.paused) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            const playPromise = audioRef.current.play();
            setIsPlaying(true);
            if (playPromise) {
                playPromise.catch(err => {
                    console.warn('[Audio] Auto-play prevented:', err);
                    setIsPlaying(false);
                });
            }
        }
    }, [playTrack]);

    const toggleMute = useCallback(() => {
        setIsMuted(prev => {
            const next = !prev;
            // Apply immediately to the running track and SFX
            const targetVolume = next ? 0 : (volumeRef.current * MASTER_VOLUME);
            if (audioRef.current) {
                audioRef.current.volume = targetVolume;
            }
            sfxRef.current.forEach(a => {
                a.volume = targetVolume;
            });
            return next;
        });
    }, []);

    const setVolume = useCallback((vol: number) => {
        const clamped = Math.max(0, Math.min(1, vol));
        setVolumeState(clamped);
        // Note: Actual volume setting on audio element happens in useEffect
        localStorage.setItem('wwmai_bgm_volume', clamped.toString());
    }, []);

    const getAudioForLevel = useCallback((level: number, type: 'question' | 'final_answer' | 'win' | 'lose'): string => {
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
        // NOTE: the original "Final Answer" stingers are not shipped; the
        // level's question track is used instead (all exist in /assets/audio).
        if (type === 'final_answer') {
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
            return '11 $100-$1,000 Questions.mp3'; // Generic Fallback
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
    }, []);

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
