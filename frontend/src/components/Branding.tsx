import React from 'react';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';

const Branding: React.FC = () => {
    return (
        <Link to="/" className="branding-container">
            <span
                className="branding-icon"
                style={{ color: 'var(--accent-color)', filter: 'drop-shadow(0 0 6px var(--accent-glow))' }}
            >
                <Trophy size={26} />
            </span>
            <span className="branding-text">WWM-MP</span>
        </Link>
    );
};

export default Branding;
