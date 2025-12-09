import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import '../styles/Forms.css';
import { API_BASE_URL } from '../config/api';

const UpgradePage: React.FC = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubscribe = async () => {
        setLoading(true);
        setError(null);
        try {
            // Get the token from localStorage manually if not exposed in useAuth, 
            // but AuthContext usually sets axios defaults or we need to pass headers.
            // Assuming AuthContext handles global headers or we need to pass it.
            // Let's check AuthContext later. For now, assume axios interceptor OR manual header.
            const token = localStorage.getItem('token');
            const response = await axios.post(`${API_BASE_URL}/api/billing/create-checkout-session`, {}, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            // Redirect to Stripe Checkout
            if (response.data.url) {
                window.location.href = response.data.url;
            } else {
                setError('Failed to start checkout.');
            }
        } catch (err: any) {
            console.error('Checkout error:', err);
            setError(err.response?.data?.error || 'Failed to initiate checkout.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="form-page-container" style={{ maxWidth: '800px' }}>
            <h1>Upgrade to <span className="highlight-text">Premium</span></h1>

            <div className="premium-card" style={{
                background: 'rgba(255, 215, 0, 0.1)',
                border: '2px solid gold',
                padding: '30px',
                borderRadius: '15px',
                marginTop: '20px'
            }}>
                <h2 style={{ color: 'gold' }}>Premium Plan</h2>
                <p className="price" style={{ fontSize: '2em', fontWeight: 'bold' }}>€5.00 <span style={{ fontSize: '0.5em', fontWeight: 'normal' }}>/ month</span></p>

                <ul style={{ textAlign: 'left', margin: '20px auto', maxWidth: '300px', listStyleType: 'none' }}>
                    <li style={{ marginBottom: '10px' }}>✅ Custom Categories (AI Generated)</li>
                    <li style={{ marginBottom: '10px' }}>✅ Host Controls (Kick, Pause, End)</li>
                    <li style={{ marginBottom: '10px' }}>✅ Exclusive Profile Badge</li>
                    <li style={{ marginBottom: '10px' }}>✅ Support Development</li>
                </ul>

                {error && <div className="error-message">{error}</div>}

                {user?.subscription_status === 'premium' ? (
                    <button className="form-submit-btn" disabled style={{ background: 'grey', cursor: 'default' }}>
                        You are already Premium!
                    </button>
                ) : (
                    <button
                        onClick={handleSubscribe}
                        className="form-submit-btn"
                        disabled={loading}
                        style={{ background: 'linear-gradient(45deg, #FFD700, #FFA500)', color: 'black', fontWeight: 'bold' }}
                    >
                        {loading ? 'Redirecting...' : 'Get Premium Now'}
                    </button>
                )}

                <p style={{ marginTop: '15px', fontSize: '0.8em', color: '#ccc' }}>
                    Secure payment via Stripe. Cancel anytime.
                </p>
            </div>
        </div>
    );
};

export default UpgradePage;
