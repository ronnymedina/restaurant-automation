import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './auth';
import { config } from '../config';

const API_URL = config.apiUrl;

type RefreshResult =
  | { ok: true; accessToken: string }
  | { ok: false };

// Singleton of the in-flight refresh request (audit H-49). Multiple concurrent
// `apiFetch` calls that hit 401 simultaneously would otherwise fire N parallel
// `POST /v1/auth/refresh`, racing each other to write the new tokens to
// localStorage (and burning N refresh-token rotations on the backend). Sharing
// one promise means the second/third caller awaits the first's result and
// reuses the freshly issued access token.
let refreshInFlight: Promise<RefreshResult> | null = null;

async function performRefresh(): Promise<RefreshResult> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return { ok: false };

  const response = await fetch(`${API_URL}/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) return { ok: false };

  const tokens = await response.json();
  setTokens(tokens.accessToken, tokens.refreshToken);
  return { ok: true, accessToken: tokens.accessToken };
}

function refreshTokens(): Promise<RefreshResult> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

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

  if (response.status === 401 && accessToken) {
    const result = await refreshTokens();
    if (result.ok) {
      headers.set('Authorization', `Bearer ${result.accessToken}`);
      response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
      });
    } else {
      clearTokens();
      window.location.href = '/login';
    }
  }

  return response;
}
