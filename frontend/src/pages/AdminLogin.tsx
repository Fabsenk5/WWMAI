
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { verifyPassword } from '../services/adminService';
import '../styles/Forms.css'; // Reusing existing styles

const AdminLogin: React.FC = () => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            const success = await verifyPassword(password);
            if (success) {
                // In a real app, you'd might store a token. Here we'll just store a flag/password for simplicity as per plan.
                localStorage.setItem('adminPassword', password);
                navigate('/admin/dashboard');
            } else {
                setError('Invalid password');
            }
        } catch (err) {
            setError('An error occurred during verification');
        }
    };

    return (
        <div className="form-page-container">
            <h1>Admin Login</h1>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <input
                        type="password"
                        id="password"
                        className="form-input"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter admin password"
                    />
                </div>
                {error && <div className="error-message">{error}</div>}
                <button type="submit" className="btn form-submit-btn">Login</button>
            </form>
        </div>
    );
};

export default AdminLogin;
