import { API_BASE_URL } from './config';

const ACCESS_TOKEN_KEYS = ['accessToken', 'token'];
const REFRESH_TOKEN_KEY = 'refreshToken';

let refreshInFlight: Promise<string | null> | null = null;
let unauthorizedNotified = false;

function readRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function resetUnauthorizedNotification(): void {
  unauthorizedNotified = false;
}

export function notifyUnauthorizedOnce(): void {
  if (typeof window === 'undefined' || unauthorizedNotified) return;
  unauthorizedNotified = true;
  window.dispatchEvent(new CustomEvent('auth:unauthorized'));
}

/**
 * Refreshes the access token through the existing backend endpoint.
 * Concurrent 401 responses share one refresh request.
 * Network/5xx failures do not log the user out; only an explicit auth rejection does.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    if (typeof window === 'undefined') return null;

    try {
      const refreshToken = readRefreshToken();
      const response = await fetch(`${API_BASE_URL.replace(/\\/+$/, '')}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(refreshToken ? { refreshToken } : {}),
      });

      let payload: any = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (response.status === 401 || response.status === 403) {
        notifyUnauthorizedOnce();
        return null;
      }

      if (!response.ok || payload?.success === false) return null;

      const data = payload?.data?.data ?? payload?.data ?? payload;
      const accessToken = data?.accessToken || data?.token;
      const nextRefreshToken = data?.refreshToken;

      if (typeof accessToken !== 'string' || !accessToken.trim()) return null;

      for (const key of ACCESS_TOKEN_KEYS) {
        localStorage.setItem(key, accessToken.trim());
      }
      if (typeof nextRefreshToken === 'string' && nextRefreshToken.trim()) {
        localStorage.setItem(REFRESH_TOKEN_KEY, nextRefreshToken.trim());
      }

      resetUnauthorizedNotification();
      return accessToken.trim();
    } catch {
      // A temporary network failure is not proof that the session is invalid.
      return null;
    }
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}
