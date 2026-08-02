import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, Mail, Lock } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import '../styles/Forms.css';
import './AuthPages.css';
import { API_BASE_URL } from '../config/api';

const LoginPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        try {
            const response = await axios.post(`${API_BASE_URL}/api/auth/login`, { email, password });
            const { token, user } = response.data;
            login(token, user);
            navigate('/');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Login failed');
        }
    };

    return (
        <div className="form-page-container">
            <h1>Login</h1>
            {error && <div className="error-message">{error}</div>}
            <form onSubmit={handleSubmit}>
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
                        />
                    </div>
                </div>
                <button type="submit" className="form-submit-btn btn-primary btn-with-icon">
                    <LogIn size={18} aria-hidden="true" />
                    Login
                </button>
            </form>
            <p className="form-footer">
                Don't have an account? <Link to="/register">Register here</Link>
            </p>
        </div>
    );
};

export default LoginPage;
