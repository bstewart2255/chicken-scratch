// Demo-app backend API client. All calls go to /demo-api/* which the demo-app
// server handles. Session state is stored in localStorage for simplicity.

const SESSION_KEY = 'demoAppSession';

export interface Session {
  userId: string;
  email: string;
  sessionToken: string;
}

export function saveSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadSession(): Session | null {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? (JSON.parse(raw) as Session) : null;
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data as T;
}

export function signup(email: string, password: string): Promise<Session> {
  return post<Session>('/demo-api/signup', { email, password });
}

export function login(email: string, password: string): Promise<Session> {
  return post<Session>('/demo-api/login', { email, password });
}

export function logout(sessionToken: string): Promise<{ success: boolean }> {
  return post<{ success: boolean }>('/demo-api/logout', { sessionToken });
}

export interface LookupMatch {
  userId: string;
  emailMask: string;
}

export function recoveryLookup(fragment: string): Promise<{ matches: LookupMatch[] }> {
  return post<{ matches: LookupMatch[] }>('/demo-api/recovery/lookup', { fragment });
}

export function recoveryComplete(userId: string, newPassword?: string): Promise<Session> {
  return post<Session>('/demo-api/recovery/complete', { userId, newPassword });
}

export interface SdkTokenResponse {
  token: string;
  externalUserId: string;
  expiresIn: number;
  expiresAt: string;
  purpose?: string;
}

export function getSdkToken(externalUserId: string, purpose: 'enroll' | 'verify'): Promise<SdkTokenResponse> {
  return post<SdkTokenResponse>('/demo-api/sdk-token', { externalUserId, purpose });
}
