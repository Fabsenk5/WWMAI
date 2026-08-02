import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lightbulb } from 'lucide-react';
import '../styles/FeatureWishlist.css';

interface FeatureWishlistButtonProps {
    className?: string;
}

const FeatureWishlistButton: React.FC<FeatureWishlistButtonProps> = ({ className }) => {
    const navigate = useNavigate();

    return (
        <button
            onClick={() => navigate('/feature-wishlist')}
            className={`wishlist-nav-btn btn btn-secondary ${className || ''}`}
            style={{ borderRadius: 'var(--radius-full)' }}
        >
            <Lightbulb size={16} />
            <span>Wishlist</span>
        </button>
    );
};

export default FeatureWishlistButton;
