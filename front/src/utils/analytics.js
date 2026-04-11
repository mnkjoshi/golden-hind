import axios from 'axios';

const BASE_URL = 'https://goldenhind.tech';

export function track(event, data = {}) {
    const user = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (!user || !token) return;

    axios.post(`${BASE_URL}/track`, { user, token, event, data }).catch(() => {});
}
