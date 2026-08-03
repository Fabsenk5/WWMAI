import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom'; // Import Link
import '../styles/Forms.css';
import '../pages/ProfilePage.css';
import { API_BASE_URL } from '../config/api';
import { AVATAR_COLORS, isInitialAvatar, getAvatarColor } from '../utils/avatar';
import FeatureWishlistButton from '../components/FeatureWishlistButton';
import { Crown, Flame, Trophy, Pencil, LogOut } from 'lucide-react';

const ProfilePage: React.FC = () => {
    const { user, logout, token, login } = useAuth(); // Need token and login to update local state
    const [isEditing, setIsEditing] = React.useState(false);
    const [editName, setEditName] = React.useState('');
    const [editAvatar, setEditAvatar] = React.useState('');
    const [msg, setMsg] = React.useState('');

    React.useEffect(() => {
        if (user) {
            setEditName(user.username);
            setEditAvatar(user.avatar_url || '');
        }
    }, [user]);

    const handleUpdate = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/auth/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ username: editName, avatar_url: editAvatar })
            });
            const data = await res.json();
            if (res.ok) {
                setMsg('Profile updated!');
                // Update context
                if (user) {
                    login(token!, { ...user, username: editName, avatar_url: editAvatar });
                }
                setIsEditing(false);
            } else {
                setMsg(data.error || 'Update failed');
            }
        } catch (e) {
            console.error(e);
            setMsg('Error updating profile');
        }
    };


    if (!user) {
        return <div className="form-page-container">Please log in to view profile.</div>;
    }

    return (
        <div className="form-page-container">
            <div className="profile-header">
                <h1>My Profile</h1>
                <FeatureWishlistButton />
            </div>
            <div className="profile-info">
                <p><strong>Username:</strong> {user.username}</p>
                <p><strong>Email:</strong> {user.email}</p>
                <p><strong>Status:</strong>{' '}
                    {user.subscription_status === 'premium' ? (
                        <span className="premium-badge"><Crown size={14} /> {user.subscription_status.toUpperCase()}</span>
                    ) : (
                        <span className="status-badge">{user.subscription_status.toUpperCase()}</span>
                    )}
                </p>

                {user.subscription_status === 'free' && (
                    <div className="profile-upgrade-wrap">
                        <Link to="/upgrade">
                            <button className="form-submit-btn premium-cta">
                                Upgrade to Premium
                            </button>
                        </Link>
                    </div>
                )}

                {/* Player Statistics */}
                <div className="profile-section">
                    <h3 className="profile-section-title">Player Statistics</h3>
                    <div className="profile-stats-grid">
                        <div className="stat-card">
                            <div className="stat-label">Games Played</div>
                            <div className="stat-value">{user.games_played || 0}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Games Won</div>
                            <div className="stat-value">{user.games_won || 0}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Win Rate</div>
                            <div className="stat-value">
                                {user.games_played ? ((user.games_won || 0) / user.games_played * 100).toFixed(1) : '0.0'}%
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Total Earnings</div>
                            <div className="stat-value stat-value-gold">
                                €{(user.total_earnings || 0).toLocaleString('de-DE')}
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Current Streak</div>
                            <div className="stat-value"><Flame className="stat-icon" size={16} />{user.current_win_streak || 0}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Best Streak</div>
                            <div className="stat-value"><Trophy className="stat-icon" size={16} />{user.longest_win_streak || 0}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Points</div>
                            <div className="stat-value stat-value-gold">{user.points || 0} ⭐</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Best Category</div>
                            <div className="stat-value stat-value-gold">
                                {user.best_category ? `${user.best_category.category} (${user.best_category.count})` : '-'}
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Worst Category</div>
                            <div className="stat-value stat-value-danger">
                                {user.worst_category ? `${user.worst_category.category} (${user.worst_category.count})` : '-'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Avatar Display */}
                <div className="profile-avatar-wrap">
                    <div className="profile-avatar">
                        {user.avatar_url && !isInitialAvatar(user.avatar_url) ? (
                            <img src={user.avatar_url} alt="Avatar" />
                        ) : (
                            <span
                                className="profile-avatar-fallback"
                                style={getAvatarColor(user.avatar_url) ? { backgroundColor: getAvatarColor(user.avatar_url) as string } : undefined}
                            >
                                {user.username.charAt(0).toUpperCase()}
                            </span>
                        )}
                    </div>
                </div>

                {/* Edit Form */}
                {isEditing ? (
                    <div className="profile-section">
                        <div className="form-group">
                            <label>Username:</label>
                            <input className="form-input" value={editName} onChange={e => setEditName(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Avatar Color:</label>
                            <div className="avatar-picker">
                                {AVATAR_COLORS.map((color, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        className={`avatar-pick ${editAvatar === `initial:${i}` ? 'avatar-pick-active' : ''}`}
                                        style={{ backgroundColor: color }}
                                        onClick={() => setEditAvatar(`initial:${i}`)}
                                        title={`Avatar ${i + 1}`}
                                    >
                                        {editAvatar === `initial:${i}` ? '✓' : ''}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Avatar URL (optional — overrides color):</label>
                            <input className="form-input" value={isInitialAvatar(editAvatar) ? '' : editAvatar} onChange={e => setEditAvatar(e.target.value)} placeholder="https://..." />
                        </div>
                        <div className="profile-actions">
                            <button onClick={handleUpdate} className="form-submit-btn">Save</button>
                            <button onClick={() => setIsEditing(false)} className="btn-secondary">Cancel</button>
                        </div>
                    </div>
                ) : (
                    <button onClick={() => setIsEditing(true)} className="btn-secondary profile-edit-btn">
                        <Pencil size={16} /> Edit Profile
                    </button>
                )}
                {msg && <p className={msg.includes('failed') || msg.includes('Error') ? 'text-danger' : 'text-success'}>{msg}</p>}

            </div>

            <button
                onClick={logout}
                className="form-submit-btn profile-logout-btn"
            >
                <LogOut size={16} /> Logout
            </button>
        </div>
    );
};

export default ProfilePage;
