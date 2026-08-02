import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Mail, Lock, UserPlus } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import '../styles/Forms.css';
import './AuthPages.css';
import { API_BASE_URL } from '../config/api';

const RegisterPage: React.FC = () => {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        try {
            const response = await axios.post(`${API_BASE_URL}/api/auth/register`, { username, email, password });
            const { token, user } = response.data;
            login(token, user);
            navigate('/'); // Check if we should redirect to profile or home
        } catch (err: any) {
            setError(err.response?.data?.error || 'Registration failed');
        }
    };

    return (
        <div className="form-page-container">
            <h1>Create Account</h1>
            {error && <div className="error-message">{error}</div>}
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label>Username</label>
                    <div className="input-with-icon">
                        <User size={18} aria-hidden="true" />
                        <input
                            type="text"
                            className="form-input"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            maxLength={20}
                        />
                    </div>
                </div>
                <div className="form-group">
                    <label>Email</label>
                    <div className="input-with-icon">
                        <Mail size={18} aria-hidden="true" />
                        <input
                            type="email"
                            className="form-input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                </div>
                <div className="form-group">
                    <label>Password</label>
                    <div className="input-with-icon">
                        <Lock size={18} aria-hidden="true" />
                        <input
                            type="password"
                            className="form-input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                        />
                    </div>
                </div>
                <button type="submit" className="form-submit-btn btn-primary btn-with-icon">
                    <UserPlus size={18} aria-hidden="true" />
                    Register
                </button>
            </form>
            <p className="form-footer">
                Already have an account? <Link to="/login">Login here</Link>
            </p>
        </div>
    );
};

export default RegisterPage;
