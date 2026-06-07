import { config } from '../config';

const API_URL = config.apiUrl;

// Singleton of the in-flight refresh request (audit H-49). Multiple concurrent
// `apiFetch` calls that hit 401 simultaneously would otherwise fire N parallel
// `POST /v1/auth/refresh`, burning N refresh-token rotations on the backend.
// Sharing one promise means the second/third caller awaits the first.
let refreshInFlight: Promise<boolean> | null = null;

async function performRefresh(): Promise<boolean> {
  const response = await fetch(`${API_URL}/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  return response.ok;
}

function refreshTokens(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const init: RequestInit = { ...options, headers, credentials: 'include' };

  let response = await fetch(`${API_URL}${path}`, init);

  if (response.status === 401 && !path.startsWith('/v1/auth/')) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      response = await fetch(`${API_URL}${path}`, init);
    } else {
      window.location.href = '/login';
    }
  }

  return response;
}
