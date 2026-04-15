import type {
  EnrollmentRequest,
  EnrollmentResponse,
  EnrollmentStatusResponse,
  VerifyRequest,
  VerifyResponse,
  ShapeEnrollmentRequest,
  FullVerifyRequest,
  FullVerifyResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  ChallengeResponse,
  Session,
} from '@chicken-scratch/shared';

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok && !data.success) {
    throw new Error(data.message || data.error || `Request failed: ${res.status}`);
  }
  return data as T;
}

export function enroll(body: EnrollmentRequest): Promise<EnrollmentResponse> {
  return request('/enroll', { method: 'POST', body: JSON.stringify(body) });
}

export function enrollShape(body: ShapeEnrollmentRequest): Promise<{ success: boolean; message: string }> {
  return request('/enroll/shape', { method: 'POST', body: JSON.stringify(body) });
}

export function getEnrollmentStatus(username: string): Promise<EnrollmentStatusResponse & { shapesEnrolled: string[]; shapesRequired: string[] }> {
  return request(`/enroll/${encodeURIComponent(username)}/status`);
}

export function verify(body: VerifyRequest): Promise<{ success: boolean; authenticated: boolean; message: string }> {
  return request('/verify', { method: 'POST', body: JSON.stringify(body) });
}

export function verifyFull(body: FullVerifyRequest): Promise<{ success: boolean; authenticated: boolean; message: string }> {
  return request('/verify/full', { method: 'POST', body: JSON.stringify(body) });
}

export function getChallenge(username: string): Promise<ChallengeResponse> {
  return request('/challenge', { method: 'POST', body: JSON.stringify({ username }) });
}

export function createSession(body: CreateSessionRequest): Promise<CreateSessionResponse> {
  return request('/session', { method: 'POST', body: JSON.stringify(body) });
}

export function getSession(id: string): Promise<Session> {
  return request(`/session/${encodeURIComponent(id)}`);
}

export function updateSession(id: string, status: string, result?: Record<string, unknown>): Promise<{ success: boolean }> {
  return request(`/session/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, result }),
  });
}

// Diagnostics API
import type { DiagnosticsUser, DiagnosticsAttempt, UserStats, BaselineSummary, ForgerySimulationResult } from '@chicken-scratch/shared';

export function getDiagnosticsUsers(): Promise<DiagnosticsUser[]> {
  return request('/diagnostics/users');
}

export function getUserAttempts(username: string): Promise<DiagnosticsAttempt[]> {
  return request(`/diagnostics/users/${encodeURIComponent(username)}/attempts`);
}

export function getAttemptDetail(username: string, attemptId: string): Promise<DiagnosticsAttempt> {
  return request(`/diagnostics/users/${encodeURIComponent(username)}/attempts/${encodeURIComponent(attemptId)}`);
}

export function getUserBaseline(username: string): Promise<BaselineSummary> {
  return request(`/diagnostics/users/${encodeURIComponent(username)}/baseline`);
}

export function getUserStats(username: string): Promise<UserStats> {
  return request(`/diagnostics/users/${encodeURIComponent(username)}/stats`);
}

export function getEnrollmentSamples(username: string): Promise<any> {
  return request(`/diagnostics/users/${encodeURIComponent(username)}/enrollment-samples`);
}

export function setAttemptForgeryFlag(attemptId: string, isForgery: boolean): Promise<{ success: boolean; isForgery: boolean }> {
  return request(`/diagnostics/attempts/${encodeURIComponent(attemptId)}/forgery`, {
    method: 'PATCH',
    body: JSON.stringify({ isForgery }),
  });
}

export function runForgerySimulation(username: string, trialsPerLevel: number = 20): Promise<ForgerySimulationResult> {
  return request(`/diagnostics/users/${encodeURIComponent(username)}/forgery-simulation`, {
    method: 'POST',
    body: JSON.stringify({ trialsPerLevel }),
  });
}

// Demo API — no auth required

export function createDemoSession(): Promise<any> {
  return request('/demo/session', { method: 'POST' });
}

export function createDemoVerifySession(username: string, enrollSessionId: string): Promise<any> {
  return request('/demo/verify-session', {
    method: 'POST',
    body: JSON.stringify({ username, enrollSessionId }),
  });
}

export function demoEnroll(username: string, signatureData: any, sessionId?: string): Promise<any> {
  return request('/demo/enroll', {
    method: 'POST',
    body: JSON.stringify({ username, signatureData, sessionId }),
  });
}

export function demoEnrollShape(username: string, shapeType: string, signatureData: any): Promise<any> {
  return request('/demo/enroll/shape', {
    method: 'POST',
    body: JSON.stringify({ username, shapeType, signatureData }),
  });
}

export function demoVerify(body: {
  username: string;
  signatureData: any;
  shapes: { shapeType: string; signatureData: any }[];
  challengeId: string;
  durationMs?: number;
  stepDurations?: { step: string; durationMs: number }[];
}): Promise<{ success: boolean; authenticated: boolean; message: string }> {
  return request('/demo/verify', { method: 'POST', body: JSON.stringify(body) });
}

export function getDemoEnrollmentStatus(username: string): Promise<any> {
  return request(`/demo/enroll/${encodeURIComponent(username)}/status`);
}

// Admin API — requires ADMIN_API_KEY
// In dev, the key is read from localStorage for convenience

function adminHeaders(): HeadersInit {
  const key = localStorage.getItem('adminApiKey') || '';
  return {
    'Content-Type': 'application/json',
    ...(key ? { 'Authorization': `Bearer ${key}` } : {}),
  };
}

async function adminRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: adminHeaders(),
    ...options,
  });
  const data = await res.json();
  if (!res.ok && !data.success) {
    throw new Error(data.message || data.error || `Request failed: ${res.status}`);
  }
  return data as T;
}

// Dashboard
export function getAdminDashboard(): Promise<{
  totalTenants: number; activeTenants: number;
  totalUsers: number; enrolledUsers: number;
  totalVerifications: number; verificationsToday: number;
  recentFailureRate: number;
}> {
  return adminRequest('/admin/dashboard');
}

// Tenants
export function getAdminTenants(): Promise<any[]> {
  return adminRequest('/admin/tenants');
}

export function getAdminTenant(id: string): Promise<any> {
  return adminRequest(`/admin/tenants/${encodeURIComponent(id)}`);
}

export function createAdminTenant(body: { name: string; slug?: string; plan?: string }): Promise<any> {
  return adminRequest('/admin/tenants', { method: 'POST', body: JSON.stringify(body) });
}

export function updateAdminTenant(id: string, body: Record<string, unknown>): Promise<any> {
  return adminRequest(`/admin/tenants/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deactivateAdminTenant(id: string): Promise<{ success: boolean }> {
  return adminRequest(`/admin/tenants/${encodeURIComponent(id)}/deactivate`, { method: 'POST' });
}

export function reactivateAdminTenant(id: string): Promise<{ success: boolean }> {
  return adminRequest(`/admin/tenants/${encodeURIComponent(id)}/reactivate`, { method: 'POST' });
}

// API Keys
export function createAdminApiKey(tenantId: string, name: string): Promise<any> {
  return adminRequest(`/admin/tenants/${encodeURIComponent(tenantId)}/api-keys`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function getAdminApiKeys(tenantId: string): Promise<any[]> {
  return adminRequest(`/admin/tenants/${encodeURIComponent(tenantId)}/api-keys`);
}

export function revokeAdminApiKey(tenantId: string, keyId: string): Promise<{ success: boolean }> {
  return adminRequest(`/admin/tenants/${encodeURIComponent(tenantId)}/api-keys/${encodeURIComponent(keyId)}`, {
    method: 'DELETE',
  });
}

// Usage
export function getAdminTenantUsage(tenantId: string, days: number = 30): Promise<{ date: string; enrollments: number; verifications: number }[]> {
  return adminRequest(`/admin/tenants/${encodeURIComponent(tenantId)}/usage?days=${days}`);
}
