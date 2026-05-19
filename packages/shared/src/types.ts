// ─── JWT Claims ───
export interface JWTPayload {
  userId: string;
  tenantId: string;
  role: string;
  plan: string;
}

// ─── API Response Envelope ───
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

// ─── OTP ───
export interface OTPSendRequest {
  phone: string;
}

export interface OTPVerifyRequest {
  phone: string;
  otp: string;
  inviteCode?: string; // present if parent joining via invite
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// ─── Tenant ───
export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  brandColor?: string;
  inviteCode: string;
  plan: string;
}

// ─── Attendance Batch ───
export interface AttendanceMarkItem {
  studentId: string;
  status: string;
}

export interface AttendanceBatchRequest {
  records: AttendanceMarkItem[];
  idempotencyKey: string;
}
