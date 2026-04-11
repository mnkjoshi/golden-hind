import { useNavigate } from "react-router-dom";
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import Topbar from "../components/topbar.jsx";

const BASE_URL = 'https://goldenhind.tech';

export default function Admin() {
    const navigate = useNavigate();
    const [tab, setTab] = useState('errors');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [newUser, setNewUser] = useState({ username: '', password: '', email: '' });
    const [createStatus, setCreateStatus] = useState('');
    const [creating, setCreating] = useState(false);

    const user = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    useEffect(() => {
        document.title = 'Admin — The Golden Hind';
        if (user !== 'manav') {
            navigate('/app');
            return;
        }
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await axios.post(`${BASE_URL}/admin/data`, { user, token });
            setData(res.data);
        } catch {
            navigate('/app');
        }
        setLoading(false);
    };

    const createUser = async () => {
        if (!newUser.username || !newUser.password || !newUser.email) {
            setCreateStatus('All fields are required.');
            return;
        }
        setCreating(true);
        setCreateStatus('');
        try {
            const res = await axios.post(`${BASE_URL}/admin/create-user`, {
                user, token,
                newUsername: newUser.username,
                newPassword: newUser.password,
                newEmail: newUser.email,
            });
            switch (res.data) {
                case 'UCS':
                    setCreateStatus('User created successfully!');
                    setNewUser({ username: '', password: '', email: '' });
                    fetchData();
                    break;
                case 'UNT':
                    setCreateStatus('Username is already taken.');
                    break;
                case 'ET':
                    setCreateStatus('Email is already in use.');
                    break;
                default:
                    setCreateStatus('Unexpected response: ' + res.data);
            }
        } catch (e) {
            setCreateStatus('Error: ' + e.message);
        }
        setCreating(false);
    };

    if (user !== 'manav') return null;

    if (loading) {
        return (
            <div className="admin-main">
                <Topbar />
                <div className="admin-loading">
                    <div className="admin-spinner"></div>
                    <p>Loading admin console...</p>
                </div>
            </div>
        );
    }

    const errors = data?.errors || [];
    const analytics = data?.analytics || [];
    const users = data?.users || [];

    const eventCounts = analytics.reduce((acc, e) => {
        acc[e.event] = (acc[e.event] || 0) + 1;
        return acc;
    }, {});
    const uniqueUsers = [...new Set(analytics.map(e => e.user))].length;

    return (
        <div className="admin-main">
            <Topbar />
            <div className="admin-container">
                <div className="admin-header">
                    <div>
                        <h1 className="admin-title">Admin Console</h1>
                        <p className="admin-subtitle">Golden Hind — logged in as manav</p>
                    </div>
                    <button className="admin-refresh-btn" onClick={fetchData}>↺ Refresh</button>
                </div>

                <div className="admin-tabs">
                    <button
                        className={`admin-tab ${tab === 'errors' ? 'active' : ''}`}
                        onClick={() => setTab('errors')}
                    >
                        Errors
                        {errors.length > 0 && <span className="tab-badge error">{errors.length}</span>}
                    </button>
                    <button
                        className={`admin-tab ${tab === 'analytics' ? 'active' : ''}`}
                        onClick={() => setTab('analytics')}
                    >
                        Analytics
                        <span className="tab-badge">{analytics.length}</span>
                    </button>
                    <button
                        className={`admin-tab ${tab === 'users' ? 'active' : ''}`}
                        onClick={() => setTab('users')}
                    >
                        Users
                        <span className="tab-badge">{users.length}</span>
                    </button>
                </div>

                {/* ERRORS TAB */}
                {tab === 'errors' && (
                    <div className="admin-panel">
                        <h2 className="panel-title">Server Errors <span className="panel-subtitle-inline">(last 100)</span></h2>
                        {errors.length === 0 ? (
                            <div className="admin-empty">
                                <span className="admin-empty-icon">✓</span>
                                <p>No errors logged. All systems nominal.</p>
                            </div>
                        ) : (
                            <div className="admin-table-wrap">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Time</th>
                                            <th>User</th>
                                            <th>Endpoint</th>
                                            <th>Error</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {errors.map((err, i) => (
                                            <tr key={i} className="error-row">
                                                <td className="td-time">{new Date(err.timestamp).toLocaleString()}</td>
                                                <td className="td-user">{err.user}</td>
                                                <td className="td-endpoint">{err.endpoint}</td>
                                                <td className="td-msg">{err.message}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ANALYTICS TAB */}
                {tab === 'analytics' && (
                    <div className="admin-panel">
                        <h2 className="panel-title">Analytics</h2>
                        <div className="analytics-stats">
                            <div className="stat-card">
                                <div className="stat-value">{analytics.length}</div>
                                <div className="stat-label">Total Events</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-value">{uniqueUsers}</div>
                                <div className="stat-label">Unique Users</div>
                            </div>
                            {Object.entries(eventCounts).map(([type, count]) => (
                                <div className="stat-card" key={type}>
                                    <div className="stat-value">{count}</div>
                                    <div className="stat-label">{type}</div>
                                </div>
                            ))}
                        </div>

                        <h3 className="panel-section-title">Recent Events</h3>
                        {analytics.length === 0 ? (
                            <div className="admin-empty">
                                <p>No analytics events recorded yet.</p>
                            </div>
                        ) : (
                            <div className="admin-table-wrap">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Time</th>
                                            <th>User</th>
                                            <th>Event</th>
                                            <th>Data</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {analytics.map((evt, i) => (
                                            <tr key={i}>
                                                <td className="td-time">{new Date(evt.timestamp).toLocaleString()}</td>
                                                <td className="td-user">{evt.user}</td>
                                                <td className="td-endpoint">{evt.event}</td>
                                                <td className="td-msg">{JSON.stringify(evt.data)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* USERS TAB */}
                {tab === 'users' && (
                    <div className="admin-panel">
                        <h2 className="panel-title">User Generator</h2>
                        <div className="user-gen-form">
                            <div className="gen-fields">
                                <input
                                    className="admin-input"
                                    placeholder="Username"
                                    value={newUser.username}
                                    onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                                    disabled={creating}
                                />
                                <input
                                    className="admin-input"
                                    placeholder="Email address"
                                    type="email"
                                    value={newUser.email}
                                    onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                                    disabled={creating}
                                />
                                <input
                                    className="admin-input"
                                    placeholder="Password"
                                    type="password"
                                    value={newUser.password}
                                    onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                    disabled={creating}
                                />
                                <button
                                    className="admin-btn"
                                    onClick={createUser}
                                    disabled={creating}
                                >
                                    {creating ? 'Creating...' : 'Create User'}
                                </button>
                            </div>
                            {createStatus && (
                                <p className={`create-status ${createStatus.includes('successfully') ? 'success' : 'failure'}`}>
                                    {createStatus}
                                </p>
                            )}
                        </div>

                        <h3 className="panel-section-title">All Users ({users.length})</h3>
                        <div className="users-grid">
                            {users.map(u => (
                                <div key={u} className={`user-chip ${u === 'manav' ? 'admin-chip' : ''}`}>
                                    {u === 'manav' && <span className="chip-crown">★</span>}
                                    {u}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
