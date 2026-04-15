export type SessionType = 'enroll' | 'verify' | 'demo_enroll' | 'demo_verify';
export type SessionStatus = 'pending' | 'in_progress' | 'completed' | 'expired';

export interface Session {
  id: string;
  username: string;
  type: SessionType;
  status: SessionStatus;
  shapeOrder: string[]; // randomized shape order for this session
  result: string | null; // JSON string of result data
  isDemo: boolean;
  createdAt: string;
  expiresAt: string;
}

export interface CreateSessionRequest {
  username: string;
  type: SessionType;
}

export interface CreateSessionResponse {
  sessionId: string;
  url: string; // full URL for QR code
  shapeOrder: string[]; // randomized shape order
  expiresAt: string;
  isDemo?: boolean;
  username?: string; // included for demo sessions
}

export interface ChallengeResponse {
  challengeId: string;
  shapeOrder: string[];
  expiresAt: string;
}
