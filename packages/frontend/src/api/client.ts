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
