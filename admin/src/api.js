const API_URL = 'http://localhost:4000';

async function request(path) {
    const res = await fetch(`${API_URL}${path}`)
    if(!res.ok){
        throw new Error(`HTTP ${res.status}`);
    }
    return res.json()
}

export const api = {
    listMember: () => request('/api/members'),
    listAttendances: () => request('/api/attendances')
};