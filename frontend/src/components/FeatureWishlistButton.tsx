import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/FeatureWishlist.css';

interface FeatureWishlistButtonProps {
    className?: string;
}

const FeatureWishlistButton: React.FC<FeatureWishlistButtonProps> = ({ className }) => {
    const navigate = useNavigate();

    return (
        <button
            onClick={() => navigate('/feature-wishlist')}
            className={`wishlist-nav-btn ${className || ''}`}
        >
            ✨ Wishlist
        </button>
    );
};

export default FeatureWishlistButton;
