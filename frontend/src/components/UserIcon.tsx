import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/App.css'; // Utilizing shared styles or we can add specific ones

const UserIcon: React.FC = () => {
    const { user } = useAuth();

    return (
        <Link
            to={user ? "/profile" : "/login"}
            className="floating-icon user-icon"
            title={user ? "Profile" : "Login"}
        >
            {user ? '👤' : '🔑'}
        </Link>
    );
};

export default UserIcon;
