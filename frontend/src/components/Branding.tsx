import React from 'react';
import { Link } from 'react-router-dom';

const Branding: React.FC = () => {
    return (
        <Link to="/" className="branding-container">
            <span className="branding-icon">🏆</span>
            <span className="branding-text">WWM-MP</span>
        </Link>
    );
};

export default Branding;
