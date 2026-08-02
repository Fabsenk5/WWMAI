import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Plus, CheckCircle, Circle, Trash2, Loader2, Rocket, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import '../styles/Forms.css'; // Use shared form styles
import '../styles/FeatureWishlist.css';

interface Wish {
    id: string;
    title: string;
    status: 'pending' | 'completed';
    created_at: string;
}

const ADMIN_EMAIL = 'fabiank5@hotmail.com';

const FeatureWishlist: React.FC = () => {
    const { user, token } = useAuth();
    const [wishes, setWishes] = useState<Wish[]>([]);
    const [loading, setLoading] = useState(true);
    const [newItem, setNewItem] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isAdmin = user?.email === ADMIN_EMAIL;

    useEffect(() => {
        fetchWishes();
    }, []);

    const fetchWishes = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/feature-wishes`);
            setWishes(response.data);
        } catch (error) {
            console.error('Failed to load wishlist:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async () => {
        if (!newItem.trim()) return;
        setIsSubmitting(true);
        try {
            await axios.post(
                `${API_BASE_URL}/api/feature-wishes`,
                { title: newItem },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setNewItem('');
            fetchWishes();
        } catch (error) {
            console.error('Failed to add wish:', error);
            alert('Failed to add wish');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleToggleStatus = async (wish: Wish) => {
        if (!isAdmin) return;
        const newStatus = wish.status === 'pending' ? 'completed' : 'pending';
        // Optimistic update
        setWishes(prev => prev.map(w => w.id === wish.id ? { ...w, status: newStatus } : w));
        try {
            await axios.put(
                `${API_BASE_URL}/api/feature-wishes/${wish.id}/status`,
                { status: newStatus },
                { headers: { Authorization: `Bearer ${token}` } }
            );
        } catch (error) {
            console.error('Failed to update status:', error);
            fetchWishes(); // Revert
        }
    };

    const handleDelete = async (id: string) => {
        if (!isAdmin || !window.confirm('Delete this wish?')) return;
        try {
            await axios.delete(`${API_BASE_URL}/api/feature-wishes/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setWishes(prev => prev.filter(w => w.id !== id));
        } catch (error) {
            console.error('Failed to delete wish:', error);
            alert('Failed to delete');
        }
    };

    if (loading) return (
        <div className="wishlist-loading">
            <Loader2 className="animate-spin" size={32} />
        </div>
    );

    return (
        <div className="form-page-container">
            <div className="wishlist-header">
                <Link to="/" className="wishlist-back-link">
                    <ArrowLeft size={24} />
                    Back
                </Link>
                <h1>Feature Wishlist</h1>
            </div>


            {/* Hero Card */}
            <div className="wishlist-hero">
                <h2>Dream Big! <Rocket className="wishlist-hero-icon" size={20} /></h2>
                <p>
                    Here is a list of features we are planning or dreaming about.
                    Stay tuned for upcoming updates!
                </p>
            </div>

            {/* User Input */}
            {user && (
                <div className="wishlist-input-container">
                    <input
                        type="text"
                        placeholder="Add a new feature idea..."
                        value={newItem}
                        onChange={(e) => setNewItem(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                        className="wishlist-input"
                    />
                    <button
                        onClick={handleAdd}
                        disabled={isSubmitting || !newItem.trim()}
                        className="wishlist-add-btn"
                    >
                        <Plus size={20} />
                    </button>
                </div>
            )}

            {/* List */}
            <div className="wishlist-list">
                {wishes.map((wish) => (
                    <div
                        key={wish.id}
                        className={`wishlist-item ${wish.status === 'completed' ? 'completed' : ''}`}
                    >
                        <button
                            onClick={() => handleToggleStatus(wish)}
                            disabled={!isAdmin}
                            className="wishlist-toggle-btn"
                        >
                            {wish.status === 'completed' ? (
                                <CheckCircle size={24} />
                            ) : (
                                <Circle size={24} />
                            )}
                        </button>

                        <div className="wishlist-item-content">
                            <h3 className="wishlist-item-title">
                                {wish.title}
                            </h3>
                            <p className="wishlist-item-date">
                                {new Date(wish.created_at).toLocaleDateString(undefined, {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric'
                                })}
                            </p>
                        </div>

                        {isAdmin && (
                            <button
                                onClick={() => handleDelete(wish.id)}
                                className="wishlist-delete-btn"
                            >
                                <Trash2 size={16} />
                            </button>
                        )}
                    </div>
                ))}

                {wishes.length === 0 && !loading && (
                    <div className="wishlist-empty">
                        <Sparkles size={18} />
                        <span>No wishes yet. Time to dream!</span>
                    </div>
                )}

            </div>
        </div >
    );
};

export default FeatureWishlist;
