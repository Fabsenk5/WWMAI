import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom'; // Import Link
import '../styles/Forms.css';
import { API_BASE_URL } from '../config/api';

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
            <h1>My Profile</h1>
            <div style={{ textAlign: 'left', marginBottom: '20px' }}>
                <p><strong>Username:</strong> {user.username}</p>
                <p><strong>Email:</strong> {user.email}</p>
                <p><strong>Status:</strong> <span style={{ color: user.subscription_status === 'premium' ? 'gold' : 'inherit' }}>{user.subscription_status.toUpperCase()}</span></p>

                {user.subscription_status === 'free' && (
                    <div style={{ marginTop: '20px' }}>
                        <Link to="/upgrade">
                            <button className="form-submit-btn" style={{ background: 'linear-gradient(45deg, #FFD700, #FFA500)', color: 'black', fontWeight: 'bold' }}>
                                Upgrade to Premium
                            </button>
                        </Link>
                    </div>
                )}

                {/* Avatar Display */}
                <div style={{ marginTop: '20px' }}>
                    {user.avatar_url ? (
                        <img src={user.avatar_url} alt="Avatar" style={{ width: '100px', height: '100px', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                        <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: '#444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No Avatar</div>
                    )}
                </div>

                {/* Edit Form */}
                {isEditing ? (
                    <div style={{ marginTop: '20px', padding: '15px', background: '#2a2a2a', borderRadius: '8px' }}>
                        <div className="form-group">
                            <label>Username:</label>
                            <input className="form-input" value={editName} onChange={e => setEditName(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Avatar URL:</label>
                            <input className="form-input" value={editAvatar} onChange={e => setEditAvatar(e.target.value)} placeholder="https://..." />
                        </div>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                            <button onClick={handleUpdate} className="form-submit-btn">Save</button>
                            <button onClick={() => setIsEditing(false)} className="form-submit-btn" style={{ background: '#555' }}>Cancel</button>
                        </div>
                    </div>
                ) : (
                    <button onClick={() => setIsEditing(true)} style={{ marginTop: '20px', padding: '5px 10px', cursor: 'pointer' }}>Edit Profile</button>
                )}
                {msg && <p style={{ color: msg.includes('failed') || msg.includes('Error') ? 'red' : 'lightgreen' }}>{msg}</p>}

            </div>

            <button
                onClick={logout}
                className="form-submit-btn"
                style={{ backgroundColor: 'var(--danger-color)', border: 'none' }}
            >
                Logout
            </button>
        </div>
    );
};

export default ProfilePage;
