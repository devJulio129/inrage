// In production set VITE_API_URL (on Render) to your backend URL.
// Locally it falls back to the dev server.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function request(path, options = {}) {
    const token = localStorage.getItem('token');
    let res;
    try {
        res = await fetch(`${API_URL}${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...options.headers,
            },
        });
    } catch {
        throw new Error(`No se pudo conectar con el servidor (${API_URL}). Verifica que el backend este corriendo.`);
    }
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err = new Error(body.error || body.message || `HTTP ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return res.json();
}

function toQuery(params = {}) {
    const pairs = Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    return pairs.length ? `?${pairs.join('&')}` : '';
}

export const api = {
    login: (email, password) =>
        request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        }),
    forgotPassword: (email) =>
        request('/api/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email }),
        }),
    getSupportWhatsappLink: () => request('/api/support/whatsapp-link'),
    resetPassword: (data) =>
        request('/api/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify(data),
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

    setMemberStreak: (id, streak) =>
        request(`/api/members/${id}/streak`, { method: 'PATCH', body: JSON.stringify({ streak }) }),

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
    getClassesCalendar: (params = {}) => request(`/api/classes/calendar${toQuery(params)}`),
    createClass: (data) =>
        request('/api/classes', { method: 'POST', body: JSON.stringify(data) }),
    updateClass: (id, data) =>
        request(`/api/classes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteClass: (id) => request(`/api/classes/${id}`, { method: 'DELETE' }),
    listTodayClasses: () => request('/api/classes/admin/today'),
    getClassRoster: (id) => request(`/api/classes/${id}/roster`),
    getBranchCheckInQr: (branch) =>
        request(`/api/admin/checkin-qr?branch=${encodeURIComponent(branch || 'Torres')}`),
    generateBranchCheckInQr: (branch) =>
        request('/api/admin/checkin-qr', {
            method: 'POST',
            body: JSON.stringify({ branch: branch || 'Torres' }),
        }),
    getCurrentCheckInToken: (id) => request(`/api/classes/${id}/check-in-token/current`),
    createCheckInToken: (id) => request(`/api/classes/${id}/check-in-token`, { method: 'POST' }),
    manualClassCheckIn: (classId, memberId) =>
        request(`/api/classes/${classId}/check-in/${memberId}`, { method: 'POST' }),

    // Negocio y membresias
    getBusinessOverview: () => request('/api/admin/business/overview'),
    getAthletesRisk: () => request('/api/admin/business/athletes-risk'),
    getClassPerformance: () => request('/api/admin/business/class-performance'),
    getMembershipOverview: () => request('/api/admin/memberships/overview'),
    listMemberships: ({ status = 'all', search = '' } = {}) =>
        request(`/api/admin/memberships?status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}`),
    updateMembership: (memberId, data) =>
        request(`/api/admin/memberships/${memberId}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),
    markMembershipPaid: (memberId, data) =>
        request(`/api/admin/memberships/${memberId}/mark-paid`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    sendMembershipReminder: (memberId, data = {}) =>
        request(`/api/admin/memberships/${memberId}/send-reminder`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    runMembershipReminders: () =>
        request('/api/admin/memberships/run-reminders', { method: 'POST' }),

    // Perfiles publicos
    getPublicProfiles: () => request('/api/admin/public-profiles'),
    updatePublicProfileAdmin: (memberId, data) =>
        request(`/api/admin/public-profiles/${memberId}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),
    getPublicAthlete: (slug) =>
        request(`/api/public/athletes/${encodeURIComponent(slug)}`),
    getHomeHighlights: () => request('/api/home/highlights'),

    // Horario semanal (franjas recurrentes que se materializan en clases)
    listClassTemplates: () => request('/api/class-templates'),
    createClassTemplate: (data) =>
        request('/api/class-templates', { method: 'POST', body: JSON.stringify(data) }),
    deleteClassTemplate: (id) =>
        request(`/api/class-templates/${id}`, { method: 'DELETE' }),

    // Publicaciones (feed del gimnasio)
    listPosts: () => request('/api/posts'),
    createPost: (data) =>
        request('/api/posts', { method: 'POST', body: JSON.stringify(data) }),
    updatePost: (id, data) =>
        request(`/api/posts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deletePost: (id) => request(`/api/posts/${id}`, { method: 'DELETE' }),

    // Mensajería (inbox por atleta)
    inbox: () => request('/api/messages/inbox'),
    thread: (memberId) => request(`/api/messages/member/${memberId}`),
    sendMessage: (memberId, data) =>
        request(`/api/messages/member/${memberId}`, { method: 'POST', body: JSON.stringify(data) }),
    deleteMessage: (id) =>
        request(`/api/messages/${id}`, { method: 'DELETE' }),

    // Reacciones — quién reaccionó
    reactionsWho: (targetType, targetId) =>
        request(`/api/reactions/who?targetType=${targetType}&targetId=${targetId}`),

    testEmail: (to) =>
        request('/api/admin/test-email', {
            method: 'POST',
            body: JSON.stringify({ to }),
        }),
    getPushStatus: () => request('/api/admin/notifications/status'),
    sendTestPush: (memberId) =>
        request('/api/admin/notifications/test', {
            method: 'POST',
            body: JSON.stringify(memberId ? { memberId } : {}),
        }),
    runNotificationJobs: () =>
        request('/api/admin/notifications/run-due', { method: 'POST' }),
};
