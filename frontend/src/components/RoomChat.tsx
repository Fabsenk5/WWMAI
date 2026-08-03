import React from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Send } from 'lucide-react';
import '../styles/RoomSocial.css';

export interface ChatMessage {
    userId: string;
    text: string;
}

interface RoomChatProps {
    messages: ChatMessage[];
    onSend: (text: string) => void;
    getPlayerName: (userId: string) => string;
}

const RoomChat: React.FC<RoomChatProps> = ({ messages, onSend, getPlayerName }) => {
    const { t } = useTranslation();
    const [open, setOpen] = React.useState(false);
    const [input, setInput] = React.useState('');

    const send = () => {
        const text = input.trim();
        if (!text) return;
        onSend(text);
        setInput('');
    };

    return (
        <div className="chat-section">
            <button className="chat-toggle" onClick={() => setOpen(!open)}>
                <MessageSquare size={16} /> {t('chat')} {open ? '▾' : '▸'}
            </button>
            {open && (
                <div className="chat-panel">
                    <div className="chat-messages">
                        {messages.length === 0 && <div className="chat-empty">{t('chat_empty')}</div>}
                        {messages.map((m, i) => (
                            <div key={i} className="chat-message"><strong>{getPlayerName(m.userId)}:</strong> {m.text}</div>
                        ))}
                    </div>
                    <div className="chat-input-row">
                        <input
                            className="form-input"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') send(); }}
                            placeholder={t('chat_placeholder')}
                            maxLength={200}
                        />
                        <button className="btn btn-primary btn-sm" onClick={send}><Send size={14} /></button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RoomChat;
