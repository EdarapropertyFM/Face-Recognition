export const API_URL = (import.meta.env.VITE_API_BASE_URL
  || `${window.location.protocol}//${window.location.hostname}:3000/api`).replace(/\/$/, '');

export async function apiFetch(path, options = {}) {
  const session = JSON.parse(localStorage.getItem('stmc_session') || 'null');
  const headers = new Headers(options.headers);
  if (session?.token) headers.set('Authorization', `Bearer ${session.token}`);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (response.status === 401 && path !== '/users/login') {
    localStorage.removeItem('stmc_session');
    window.dispatchEvent(new Event('stmc:unauthorized'));
  }
  return response;
}

export function apiUrl(path) {
  return `${API_URL}${path}`;
}
