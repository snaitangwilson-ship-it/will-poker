export const authFetch = async (url: string, options: RequestInit = {}) => {
  const user = localStorage.getItem('user');
  const token = user ? JSON.parse(user).token : null;

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    localStorage.removeItem('user');
    window.location.href = '/';
    throw new Error('Session expired. Please log in again.');
  }

  return response;
};