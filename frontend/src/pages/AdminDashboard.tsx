import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    getAllCategories,
    deleteQuestionsByCategories,
    listQuestions,
    deleteQuestion,
    Question,
    QuestionsResponse
} from '../services/adminService';
import '../styles/Forms.css';
import '../styles/App.css';

const AdminDashboard: React.FC = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'categories' | 'questions'>('categories');
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
    const [loadingQuestions, setLoadingQuestions] = useState(false);

    useEffect(() => {
        const storedPassword = localStorage.getItem('adminPassword');
        if (!storedPassword) {
            navigate('/admin');
            return;
        }
        setAdminPassword(storedPassword);

        // Initial fetch
        fetchCategories();
    }, [navigate]);

    useEffect(() => {
        if (activeTab === 'questions') {
            fetchQuestions();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, page, filterCategory, filterDifficulty]);

    const fetchCategories = async () => {
        try {
            const cats = await getAllCategories();
            setCategories(cats);
        } catch (error) {
            console.error('Failed to load categories', error);
        }
    };

    const fetchQuestions = async () => {
        setLoadingQuestions(true);
        try {
            const data: QuestionsResponse = await listQuestions(page, 20, filterCategory, filterDifficulty);
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
                                    className={`category-chip ${selectedCategories.includes(category) ? 'selected' : ''}`}
                                    onClick={() => handleCategoryToggle(category)}
                                >
                                    {category}
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
                                    <option value="">All Difficulties</option>
                                    <option value="easy">Easy</option>
                                    <option value="medium">Medium</option>
                                    <option value="hard">Hard</option>
                                    <option value="very_hard">Very Hard</option>
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
                                                <td style={{ padding: '10px', color: 'var(--success-color)' }}>{q.correctAnswer}</td>
                                                <td style={{ padding: '10px' }}>
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
            </div>
        </div>
    );
};

export default AdminDashboard;
