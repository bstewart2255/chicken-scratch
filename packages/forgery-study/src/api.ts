import type {
  ForgeryStudyView,
  ForgeryAttemptSubmission,
  ForgeryAttemptResult,
} from '@chicken-scratch/shared';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || data.message || `Request failed: ${res.status}`);
  }
  return data as T;
}

export function getStudy(id: string): Promise<ForgeryStudyView> {
  return request(`/api/forgery-study/${encodeURIComponent(id)}`);
}

export function submitAttempt(
  id: string,
  body: ForgeryAttemptSubmission,
): Promise<ForgeryAttemptResult> {
  return request(`/api/forgery-study/${encodeURIComponent(id)}/attempt`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
