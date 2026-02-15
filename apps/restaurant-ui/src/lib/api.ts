import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './auth';

const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:3000';

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers);

  const accessToken = getAccessToken();
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  // Auto-refresh on 401
  if (response.status === 401 && accessToken) {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      const refreshResponse = await fetch(`${API_URL}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (refreshResponse.ok) {
        const tokens = await refreshResponse.json();
        setTokens(tokens.accessToken, tokens.refreshToken);

        // Retry original request with new token
        headers.set('Authorization', `Bearer ${tokens.accessToken}`);
        response = await fetch(`${API_URL}${path}`, {
          ...options,
          headers,
        });
      } else {
        clearTokens();
        window.location.href = '/login';
        return response;
      }
    } else {
      clearTokens();
      window.location.href = '/login';
      return response;
    }
  }

  return response;
}
