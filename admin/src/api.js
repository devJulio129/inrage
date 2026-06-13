// In production set VITE_API_URL (on Render) to your backend URL.
// Locally it falls back to the dev server.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function request(path, options = {}) {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options.headers,
        },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
}

export const api = {
    login: (email, password) =>
        request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        }),

    listMembers: () => request('/api/members'),

    createMember: (data) =>
        request('/api/members', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    updateMember: (id, data) =>
        request(`/api/members/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),

    deleteMember: (id) =>
        request(`/api/members/${id}`, { method: 'DELETE' }),

    listLoginLogs: () => request('/api/login-logs'),

    listWorkouts: () => request('/api/workouts'),

    saveWorkout: (data) =>
        request('/api/workouts', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    deleteWorkout: (id) =>
        request(`/api/workouts/${id}`, { method: 'DELETE' }),

    getWodComments: (id) => request(`/api/workouts/${id}/comments`),

    deleteWodComment: (wodId, commentId) =>
        request(`/api/workouts/${wodId}/comments/${commentId}`, { method: 'DELETE' }),

    getStats: () => request('/api/stats'),

    getActiveAttendance: () => request('/api/attendances/active'),

    getGymInfo: () => request('/api/gym-info'),

    saveGymInfo: (data) =>
        request('/api/gym-info', {
            method: 'PUT',
            body: JSON.stringify(data),
        }),

    // Clases con cupo
    listClasses: () => request('/api/classes'),
    createClass: (data) =>
        request('/api/classes', { method: 'POST', body: JSON.stringify(data) }),
    deleteClass: (id) => request(`/api/classes/${id}`, { method: 'DELETE' }),

    // Publicaciones (feed del gimnasio)
    listPosts: () => request('/api/posts'),
    createPost: (data) =>
        request('/api/posts', { method: 'POST', body: JSON.stringify(data) }),
    deletePost: (id) => request(`/api/posts/${id}`, { method: 'DELETE' }),
};
