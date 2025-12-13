import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    getAllCategories,
    deleteQuestionsByCategories,
    listQuestions,
    deleteQuestion,
    getGlobalPremiumStatus,
    toggleGlobalPremiumStatus,
    getAllUsers,
    updateUserStatus,
    deleteUser,
    updateQuestionStatus,
    updateCategoryStatus,
    updateAllQuestionsStatus,
    regenerateQuestions,
    Question,
    QuestionsResponse,
    User
} from '../services/adminService';
import '../styles/Forms.css';
import '../styles/App.css';

const AdminDashboard: React.FC = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'categories' | 'questions' | 'settings' | 'users'>('categories');
    const [adminPassword, setAdminPassword] = useState('');

    // Category State
    const [categories, setCategories] = useState<string[]>([]);
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [deleteMessage, setDeleteMessage] = useState('');

    // Question Explorer State
    const [questions, setQuestions] = useState<Question[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [filterCategory, setFilterCategory] = useState('');
    const [filterDifficulty, setFilterDifficulty] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [loadingQuestions, setLoadingQuestions] = useState(false);

    // Global Settings State
    const [globalPremiumUnlocked, setGlobalPremiumUnlocked] = useState(false);
    const [globalGuestPremiumUnlocked, setGlobalGuestPremiumUnlocked] = useState(false);
    const [settingsMessage, setSettingsMessage] = useState('');

    // User Management State
    const [users, setUsers] = useState<User[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [userMessage, setUserMessage] = useState('');

    useEffect(() => {
        const storedPassword = localStorage.getItem('adminPassword');
        if (!storedPassword) {
            navigate('/admin');
            return;
        }
        setAdminPassword(storedPassword);

        // Initial fetch - Pass storedPassword directly because setAdminPassword state update isn't immediate
        fetchCategories(storedPassword);
        fetchGlobalSettings(storedPassword);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigate]);

    useEffect(() => {
        if (activeTab === 'questions') {
            fetchQuestions();
        } else if (activeTab === 'users') {
            fetchUsers();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, page, filterCategory, filterDifficulty, filterStatus]);

    const fetchUsers = async () => {
        setLoadingUsers(true);
        try {
            const data = await getAllUsers(adminPassword);
            setUsers(data);
        } catch (error) {
            console.error('Failed to load users', error);
            setUserMessage('Failed to load users');
        } finally {
            setLoadingUsers(false);
        }
    };

    const handleUpdateUserStatus = async (user: User) => {
        const newStatus = user.subscription_status === 'premium' ? 'free' : 'premium';
        const action = newStatus === 'premium' ? 'Preimium' : 'Free';
        if (!window.confirm(`Are you sure you want to change ${user.username}'s status to ${action}?`)) return;

        try {
            const result = await updateUserStatus(user.id, newStatus, adminPassword);
            if (result.success) {
                setUsers(users.map(u => u.id === user.id ? result.user : u));
                setUserMessage(`Updated ${user.username} to ${newStatus}`);
                setTimeout(() => setUserMessage(''), 3000);
            }
        } catch (error) {
            console.error('Error updating user status:', error);
            setUserMessage('Failed to update status');
        }
    };

    const handleDeleteUser = async (user: User) => {
        if (!window.confirm(`Are you sure you want to PERMANENTLY DELETE user ${user.username} (${user.email})? This cannot be undone.`)) return;

        try {
            const result = await deleteUser(user.id, adminPassword);
            if (result.success) {
                setUsers(users.filter(u => u.id !== user.id));
                setUserMessage(`Deleted user ${user.username}`);
                setTimeout(() => setUserMessage(''), 3000);
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            setUserMessage('Failed to delete user');
        }
    };

    const fetchCategories = async (pwd?: string) => {
        const passwordToUse = pwd || adminPassword;
        if (!passwordToUse) return;

        try {
            const cats = await getAllCategories(passwordToUse);
            setCategories(cats);
        } catch (error) {
            console.error('Failed to load categories', error);
        }
    };

    const fetchGlobalSettings = async (pwd?: string) => {
        const passwordToUse = pwd || adminPassword;
        if (!passwordToUse) return;

        try {
            const { userUnlocked, guestUnlocked } = await getGlobalPremiumStatus(passwordToUse);
            setGlobalPremiumUnlocked(userUnlocked);
            setGlobalGuestPremiumUnlocked(guestUnlocked);
        } catch (error) {
            console.error('Failed to load global settings', error);
        }
    };

    const fetchQuestions = async () => {
        setLoadingQuestions(true);
        try {
            const isActive = filterStatus === 'active' ? true : filterStatus === 'archived' ? false : undefined;
            const data: QuestionsResponse = await listQuestions(adminPassword, page, 20, filterCategory, filterDifficulty, isActive);
            setQuestions(data.questions);
            setTotal(data.total);
            setTotalPages(data.totalPages);
        } catch (error) {
            console.error('Failed to load questions', error);
        } finally {
            setLoadingQuestions(false);
        }
    };

    const handleCategoryToggle = (category: string) => {
        setSelectedCategories(prev => {
            if (prev.includes(category)) {
                return prev.filter(c => c !== category);
            } else {
                return [...prev, category];
            }
        });
    };

    const handleDeleteCategories = async () => {
        if (selectedCategories.length === 0) return;
        if (!window.confirm(`Are you sure you want to delete all questions in these ${selectedCategories.length} categories? This cannot be undone.`)) return;

        try {
            const result = await deleteQuestionsByCategories(selectedCategories, adminPassword);
            if (result.success) {
                setDeleteMessage(result.message);
                setSelectedCategories([]);
                fetchCategories(); // Refresh list
                setTimeout(() => setDeleteMessage(''), 3000);
            } else {
                setDeleteMessage('Failed: ' + result.message);
            }
        } catch (error) {
            setDeleteMessage('Error deleting categories');
        }
    };

    const handleDeleteQuestion = async (id: number) => {
        if (!window.confirm('Are you sure you want to delete this specific question?')) return;

        try {
            const result = await deleteQuestion(id, adminPassword);
            if (result.success) {
                fetchQuestions(); // Refresh list
            } else {
                alert('Failed to delete question: ' + result.message);
            }
        } catch (error) {
            console.error('Error deleting question:', error);
            alert('Error deleting question');
        }
    };

    const handleToggleGlobalPremium = async (type: 'user' | 'guest') => {
        const currentStatus = type === 'user' ? globalPremiumUnlocked : globalGuestPremiumUnlocked;
        const newValue = !currentStatus;
        const targetName = type === 'user' ? 'REGISTERED USERS' : 'GUESTS';

        if (!window.confirm(`Are you sure you want to ${newValue ? 'UNLOCK' : 'LOCK'} premium features for ${targetName}?`)) return;

        try {
            const unlocked = await toggleGlobalPremiumStatus(newValue, adminPassword, type);
            if (type === 'user') {
                setGlobalPremiumUnlocked(unlocked);
            } else {
                setGlobalGuestPremiumUnlocked(unlocked);
            }
            setSettingsMessage(`${targetName} Premium Features ${unlocked ? 'Unlocked' : 'Locked'}`);
            setTimeout(() => setSettingsMessage(''), 3000);
        } catch (error) {
            console.error('Error updating global premium status:', error);
            setSettingsMessage('Failed to update status');
        }
    };

    const handleUpdateQuestionStatus = async (id: number, isActive: boolean) => {
        try {
            const result = await updateQuestionStatus(id, isActive, adminPassword);
            if (result.success) {
                // Update local state
                setQuestions(prev => prev.map(q => q.id === id ? { ...q, is_active: isActive } : q));
            } else {
                alert('Failed to update status');
            }
        } catch (error) {
            console.error('Error updating question status:', error);
        }
    };

    const handleUpdateCategoryStatus = async (category: string, isActive: boolean) => {
        if (!window.confirm(`Are you sure you want to ${isActive ? 'ACTIVATE' : 'ARCHIVE'} all questions in "${category}"?`)) return;

        try {
            const result = await updateCategoryStatus(category, isActive, adminPassword);
            if (result.success) {
                setDeleteMessage(result.message);
                setTimeout(() => setDeleteMessage(''), 3000);
            }
        } catch (error) {
            setDeleteMessage('Error updating category status');
        }
    };

    const handleUpdateAllStatus = async (isActive: boolean) => {
        if (!window.confirm(`Are you sure you want to ${isActive ? 'ACTIVATE' : 'ARCHIVE'} ALL QUESTIONS GLOBALLY? This is a major action.`)) return;

        try {
            const result = await updateAllQuestionsStatus(isActive, adminPassword);
            if (result.success) {
                setSettingsMessage(result.message);
                setTimeout(() => setSettingsMessage(''), 3000);
            }
        } catch (error) {
            setSettingsMessage('Error updating global status');
        }
    };

    const handleRegenerate = async () => {
        if (!window.confirm('This will ARCHIVE ALL existing questions and start regenerating new ones from the AI. Are you sure?')) return;

        try {
            const result = await regenerateQuestions(adminPassword);
            if (result.success) {
                setSettingsMessage(result.message);
                setTimeout(() => setSettingsMessage(''), 5000);
            }
        } catch (error) {
            setSettingsMessage('Error starting regeneration');
        }
    };

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px', color: 'var(--text-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1>Admin Dashboard</h1>
                <button
                    onClick={() => { localStorage.removeItem('adminPassword'); navigate('/'); }}
                    className="btn"
                    style={{ backgroundColor: 'var(--danger-color)' }}
                >
                    Logout
                </button>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <button
                    className={`btn ${activeTab === 'categories' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ opacity: activeTab === 'categories' ? 1 : 0.7 }}
                    onClick={() => setActiveTab('categories')}
                >
                    Manage Categories
                </button>
                <button
                    className={`btn ${activeTab === 'questions' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ opacity: activeTab === 'questions' ? 1 : 0.7 }}
                    onClick={() => setActiveTab('questions')}
                >
                    Question Explorer
                </button>
                <button
                    className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ opacity: activeTab === 'users' ? 1 : 0.7 }}
                    onClick={() => setActiveTab('users')}
                >
                    User Management
                </button>
                <button
                    className={`btn ${activeTab === 'settings' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ opacity: activeTab === 'settings' ? 1 : 0.7 }}
                    onClick={() => setActiveTab('settings')}
                >
                    Global Settings
                </button>
            </div>

            {/* Contextual Global Controls */}
            <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                    className="btn btn-primary"
                    style={{ backgroundColor: 'var(--primary-color)' }}
                    onClick={handleRegenerate}
                >
                    🔄 Archive & Regenerate All
                </button>
                <button
                    className="btn"
                    style={{ backgroundColor: 'var(--danger-color)' }}
                    onClick={() => handleUpdateAllStatus(false)}
                >
                    ⚠️ Archive ALL
                </button>
            </div>

            <div className="form-page-container" style={{ maxWidth: '100%' }}>
                {activeTab === 'categories' && (
                    <div>
                        <h2>Delete Categories</h2>
                        <p style={{ marginBottom: '20px', color: 'var(--text-secondary)' }}>
                            Select categories to remove ALL associated questions from the database.
                        </p>

                        <div className="categories-grid" style={{ maxHeight: '400px', overflowY: 'auto', padding: '10px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                            {categories.map(category => (
                                <div
                                    key={category}
                                    style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}
                                >
                                    <div
                                        className={`category-chip ${selectedCategories.includes(category) ? 'selected' : ''}`}
                                        onClick={() => handleCategoryToggle(category)}
                                        style={{ flex: 1 }}
                                    >
                                        {category}
                                    </div>
                                    <button
                                        className="btn small-btn"
                                        title="Archive All in Category"
                                        style={{ padding: '2px 5px', fontSize: '10px', backgroundColor: 'var(--text-secondary)' }}
                                        onClick={() => handleUpdateCategoryStatus(category, false)}
                                    >
                                        📁
                                    </button>
                                    <button
                                        className="btn small-btn"
                                        title="Activate All in Category"
                                        style={{ padding: '2px 5px', fontSize: '10px', backgroundColor: 'var(--success-color)' }}
                                        onClick={() => handleUpdateCategoryStatus(category, true)}
                                    >
                                        ✅
                                    </button>
                                </div>
                            ))}
                        </div>

                        {deleteMessage && <div className={`error-message ${deleteMessage.includes('Success') ? 'success' : ''}`} style={{ borderColor: deleteMessage.includes('Success') ? 'var(--success-color)' : '' }}>{deleteMessage}</div>}

                        <button
                            className="btn form-submit-btn"
                            style={{ backgroundColor: 'var(--danger-color)', marginTop: '20px' }}
                            disabled={selectedCategories.length === 0}
                            onClick={handleDeleteCategories}
                        >
                            Delete Selected ({selectedCategories.length})
                        </button>
                    </div>
                )}

                {activeTab === 'questions' && (
                    <div>
                        <h2>Question Explorer</h2>
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', marginBottom: '5px' }}>Filter by Category</label>
                                <select
                                    className="form-select"
                                    value={filterCategory}
                                    onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
                                >
                                    <option value="">All Categories</option>
                                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', marginBottom: '5px' }}>Filter by Difficulty</label>
                                <select
                                    className="form-select"
                                    value={filterDifficulty}
                                    onChange={(e) => { setFilterDifficulty(e.target.value); setPage(1); }}
                                >
                                    <option value="very_hard">Very Hard</option>
                                </select>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', marginBottom: '5px' }}>Filter by Status</label>
                                <select
                                    className="form-select"
                                    value={filterStatus}
                                    onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
                                >
                                    <option value="all">All Status</option>
                                    <option value="active">Active Only</option>
                                    <option value="archived">Archived Only</option>
                                </select>
                            </div>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                                        <th style={{ padding: '10px' }}>ID</th>
                                        <th style={{ padding: '10px' }}>Category</th>
                                        <th style={{ padding: '10px' }}>Diff</th>
                                        <th style={{ padding: '10px' }}>Question</th>
                                        <th style={{ padding: '10px' }}>Correct Answer</th>
                                        <th style={{ padding: '10px' }}>Status</th>
                                        <th style={{ padding: '10px' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loadingQuestions ? (
                                        <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center' }}>Loading...</td></tr>
                                    ) : questions.length === 0 ? (
                                        <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center' }}>No questions found</td></tr>
                                    ) : (
                                        questions.map(q => (
                                            <tr key={q.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                <td style={{ padding: '10px' }}>{q.id}</td>
                                                <td style={{ padding: '10px' }}>
                                                    <span style={{ fontSize: '0.8em', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                                        {q.category}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px' }}>{q.difficulty}</td>
                                                <td style={{ padding: '10px' }}>{q.text}</td>
                                                <td style={{ padding: '10px' }}>{q.correctAnswer}</td>
                                                <td style={{ padding: '10px' }}>
                                                    <span style={{
                                                        color: q.is_active ? 'var(--success-color)' : 'var(--text-secondary)',
                                                        fontWeight: 'bold'
                                                    }}>
                                                        {q.is_active ? 'ACTIVE' : 'ARCHIVED'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px' }}>
                                                    <button
                                                        className="btn"
                                                        style={{
                                                            padding: '4px 8px',
                                                            fontSize: '0.8rem',
                                                            backgroundColor: q.is_active ? 'gray' : 'var(--success-color)',
                                                            color: 'white',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer',
                                                            marginRight: '5px'
                                                        }}
                                                        onClick={() => handleUpdateQuestionStatus(q.id, !q.is_active)}
                                                    >
                                                        {q.is_active ? 'Archive' : 'Activate'}
                                                    </button>
                                                    <button
                                                        className="btn"
                                                        style={{
                                                            padding: '4px 8px',
                                                            fontSize: '0.8rem',
                                                            backgroundColor: 'var(--danger-color)',
                                                            color: 'white',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer'
                                                        }}
                                                        onClick={() => handleDeleteQuestion(q.id)}
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '10px', alignItems: 'center' }}>
                            <button
                                className="btn btn-secondary"
                                disabled={page <= 1}
                                onClick={() => setPage(p => p - 1)}
                            >
                                Prev
                            </button>
                            <span>Page {page} of {totalPages || 1} (Total: {total})</span>
                            <button
                                className="btn btn-secondary"
                                disabled={page >= totalPages}
                                onClick={() => setPage(p => p + 1)}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'users' && (
                    <div>
                        <h2>User Management</h2>
                        {userMessage && (
                            <div className={`error-message ${userMessage.includes('Failed') ? '' : 'success'}`}
                                style={{
                                    borderColor: userMessage.includes('Failed') ? 'var(--danger-color)' : 'var(--success-color)',
                                    marginBottom: '20px'
                                }}>
                                {userMessage}
                            </div>
                        )}

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                                        <th style={{ padding: '10px' }}>ID</th>
                                        <th style={{ padding: '10px' }}>Username</th>
                                        <th style={{ padding: '10px' }}>Email</th>
                                        <th style={{ padding: '10px' }}>Status</th>
                                        <th style={{ padding: '10px' }}>Expiry</th>
                                        <th style={{ padding: '10px' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loadingUsers ? (
                                        <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center' }}>Loading...</td></tr>
                                    ) : users.length === 0 ? (
                                        <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center' }}>No users found</td></tr>
                                    ) : (
                                        users.map(user => (
                                            <tr key={user.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                <td style={{ padding: '10px' }}>{user.id}</td>
                                                <td style={{ padding: '10px' }}>{user.username}</td>
                                                <td style={{ padding: '10px' }}>{user.email}</td>
                                                <td style={{ padding: '10px' }}>
                                                    <span style={{
                                                        padding: '4px 8px',
                                                        borderRadius: '4px',
                                                        backgroundColor: user.subscription_status === 'premium' ? 'var(--primary-color)' : 'var(--bg-secondary)',
                                                        color: user.subscription_status === 'premium' ? 'white' : 'var(--text-primary)',
                                                        fontSize: '0.8em'
                                                    }}>
                                                        {user.subscription_status.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px' }}>
                                                    {user.subscription_end_date ? new Date(user.subscription_end_date).toLocaleDateString() : 'N/A'}
                                                </td>
                                                <td style={{ padding: '10px', display: 'flex', gap: '10px' }}>
                                                    <button
                                                        className="btn"
                                                        style={{
                                                            padding: '4px 8px',
                                                            fontSize: '0.8rem',
                                                            backgroundColor: user.subscription_status === 'premium' ? 'var(--bg-secondary)' : 'var(--success-color)',
                                                            color: user.subscription_status === 'premium' ? 'var(--text-primary)' : 'white',
                                                            border: '1px solid var(--border-color)',
                                                        }}
                                                        onClick={() => handleUpdateUserStatus(user)}
                                                    >
                                                        {user.subscription_status === 'premium' ? 'Revert to Free' : 'Make Premium'}
                                                    </button>
                                                    <button
                                                        className="btn"
                                                        style={{
                                                            padding: '4px 8px',
                                                            fontSize: '0.8rem',
                                                            backgroundColor: 'var(--danger-color)',
                                                            color: 'white',
                                                            border: 'none',
                                                        }}
                                                        onClick={() => handleDeleteUser(user)}
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'settings' && (
                    <div>
                        <h2>Global Settings</h2>
                        <div style={{
                            padding: '20px',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: 'var(--bg-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <h3 style={{ margin: '0 0 10px 0' }}>Unlock Premium Features</h3>
                                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                                    When enabled, ALL users (including free tier) will have access to premium features.
                                </p>
                            </div>
                            <div className="toggle-switch">
                                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '10px' }}>
                                    <input
                                        type="checkbox"
                                        checked={globalPremiumUnlocked}
                                        onChange={() => handleToggleGlobalPremium('user')}
                                        style={{ accentColor: 'var(--primary-color)', transform: 'scale(1.5)' }}
                                    />
                                    <span style={{ fontWeight: 'bold' }}>
                                        {globalPremiumUnlocked ? 'UNLOCKED' : 'LOCKED'}
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div style={{
                            padding: '20px',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: 'var(--bg-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginTop: '20px'
                        }}>
                            <div>
                                <h3 style={{ margin: '0 0 10px 0' }}>Unlock Premium for GUESTS</h3>
                                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                                    When enabled, GUESTS (non-logged-in users) will have access to premium features like Custom Topics.
                                </p>
                            </div>
                            <div className="toggle-switch">
                                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '10px' }}>
                                    <input
                                        type="checkbox"
                                        checked={globalGuestPremiumUnlocked}
                                        onChange={() => handleToggleGlobalPremium('guest')}
                                        style={{ accentColor: 'var(--secondary-color)', transform: 'scale(1.5)' }}
                                    />
                                    <span style={{ fontWeight: 'bold' }}>
                                        {globalGuestPremiumUnlocked ? 'UNLOCKED' : 'LOCKED'}
                                    </span>
                                </label>
                            </div>
                        </div>
                        {settingsMessage && (
                            <div className="error-message success" style={{ marginTop: '20px', borderColor: 'var(--success-color)' }}>
                                {settingsMessage}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminDashboard;
