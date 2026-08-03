import React from 'react';
import '../styles/RoomSocial.css';

const EMOTES = ['👍', '😂', '😱', '🎉', '😎', '🤔'];

interface EmoteBarProps {
    onEmote: (emote: string) => void;
}

const EmoteBar: React.FC<EmoteBarProps> = ({ onEmote }) => (
    <div className="emote-bar">
        {EMOTES.map(e => (
            <button key={e} className="emote-btn" onClick={() => onEmote(e)} title={`Send ${e}`}>{e}</button>
        ))}
    </div>
);

export default EmoteBar;
