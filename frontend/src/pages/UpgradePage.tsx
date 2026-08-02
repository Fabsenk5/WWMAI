import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import '../styles/Forms.css';
import '../pages/UpgradePage.css';
import { API_BASE_URL } from '../config/api';
import { Check } from 'lucide-react';

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

            <div className="premium-card">
                <h2>Premium Plan</h2>
                <p className="price">€5.00 <span className="price-period">/ month</span></p>

                <ul className="feature-list">
                    <li className="feature-item"><Check className="feature-check" size={18} /> Custom Categories (AI Generated)</li>
                    <li className="feature-item"><Check className="feature-check" size={18} /> Host Controls (Kick, Pause, End)</li>
                    <li className="feature-item"><Check className="feature-check" size={18} /> Exclusive Profile Badge</li>
                    <li className="feature-item"><Check className="feature-check" size={18} /> Support Development</li>
                </ul>

                {error && <div className="error-message">{error}</div>}

                {user?.subscription_status === 'premium' ? (
                    <button className="form-submit-btn" disabled>
                        You are already Premium!
                    </button>
                ) : (
                    <button
                        onClick={handleSubscribe}
                        className="form-submit-btn premium-btn"
                        disabled={loading}
                    >
                        {loading ? 'Redirecting...' : 'Get Premium Now'}
                    </button>
                )}

                <p className="premium-note">
                    Secure payment via Stripe. Cancel anytime.
                </p>
            </div>
        </div>
    );
};

export default UpgradePage;
