import Constants from "expo-constants";
import type {
  ApiResponse,
  AttendanceBatchRequest,
  AttendanceBatchResult,
  AttendanceHistoryItem,
  AttendanceSessionDetailResponse,
  AttendanceSessionResponse,
  ClassResponse,
  InviteGenerateResponse,
  InviteResolveResponse,
  OTPVerifyResponse,
  OTPVerifyResult,
  OTPVerifyRequest,
  OTPSendResponse,
  ParentFeedResponse,
  RefreshResponse,
  ScheduleResponse,
  StudentResponse,
  TenantInfo,
  PaginatedResponse,
  AnnouncementResponse,
} from "@whiteroom/shared";
import { sessionStore } from "@/auth/session-store";

const configuredBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  Constants.expoConfig?.extra?.apiBaseUrl ||
  "http://localhost:3000/api/v1";

export const API_BASE_URL = String(configuredBaseUrl).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as ApiResponse<T>;
  if (!response.ok || payload.success === false) {
    throw new ApiError(
      payload.error?.code ?? "HTTP_ERROR",
      payload.error?.message ?? `Request failed with ${response.status}`,
      response.status,
      payload.error?.details
    );
  }

  return payload.data as T;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const { accessToken, refreshToken, setTokens, clear } = sessionStore.getState();
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && retry && refreshToken) {
    try {
      const refreshed = await request<RefreshResponse>(
        "/auth/refresh",
        {
          method: "POST",
          body: JSON.stringify({ refreshToken }),
        },
        false
      );
      await setTokens(refreshed.accessToken, refreshToken);
      return request<T>(path, options, false);
    } catch {
      await clear();
    }
  }

  return parseResponse<T>(response);
}

export const api = {
  /**
   * @deprecated — SMS now handled by Firebase client-side. This endpoint is a no-op.
   */
  otpSend: (phone: string): Promise<OTPSendResponse> =>
    request<OTPSendResponse>("/auth/otp/send", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),
  otpVerify: (input: { idToken: string }): Promise<OTPVerifyResult> =>
    request<OTPVerifyResult>("/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  register: (input: {
    registrationToken: string;
    role: "teacher" | "parent";
    consentAccepted: boolean;
    inviteCode?: string;
    studentName?: string;
    rollNumber?: string;
  }): Promise<OTPVerifyResponse> =>
    request<OTPVerifyResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  logout: (deviceToken?: string) =>
    request<{ loggedOut: boolean }>("/auth/logout", {
      method: "POST",
      body: deviceToken ? JSON.stringify({ deviceToken }) : undefined,
      headers: deviceToken ? { "X-Device-Token": deviceToken } : undefined,
    }),
  switchTenant: (tenantId: string): Promise<OTPVerifyResponse> =>
    request<OTPVerifyResponse>("/auth/switch-tenant", {
      method: "POST",
      body: JSON.stringify({ tenantId }),
    }),
  tenantMe: () => request<TenantInfo>("/tenants/me"),
  tenantUpdate: (input: { name?: string; logoUrl?: string; brandColor?: string; publicSearch?: boolean }) =>
    request<TenantInfo>("/tenants/me", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  inviteGenerate: () =>
    request<InviteGenerateResponse>("/invite", { method: "POST" }),
  inviteResolve: (code: string): Promise<InviteResolveResponse> =>
    request<InviteResolveResponse>(`/invite/${code}`),
  classes: (page?: number, limit?: number) => {
    const params = new URLSearchParams();
    if (page) params.set("page", String(page));
    if (limit) params.set("limit", String(limit));
    const query = params.toString();
    return request<PaginatedResponse<ClassResponse>>(
      query ? `/classes?${query}` : "/classes"
    );
  },
  classCreate: (input: { name: string; subject?: string; teacherName?: string }) =>
    request<ClassResponse>("/classes", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  classUpdate: (
    id: string,
    input: { name?: string; subject?: string | null; teacherName?: string | null }
  ) =>
    request<ClassResponse>(`/classes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  classDelete: (id: string) => request<ClassResponse>(`/classes/${id}`, { method: "DELETE" }),
  classStudents: (classId: string, page?: number, limit?: number) => {
    const params = new URLSearchParams();
    if (page) params.set("page", String(page));
    if (limit) params.set("limit", String(limit));
    const query = params.toString();
    return request<PaginatedResponse<StudentResponse>>(
      query ? `/classes/${classId}/students?${query}` : `/classes/${classId}/students`
    );
  },
  classAddStudents: (classId: string, studentIds: string[]) =>
    request<{ enrolled: number; skipped: number }>(`/classes/${classId}/students`, {
      method: "POST",
      body: JSON.stringify({ studentIds }),
    }),
  students: (page?: number, limit?: number) => {
    const params = new URLSearchParams();
    if (page) params.set("page", String(page));
    if (limit) params.set("limit", String(limit));
    const query = params.toString();
    return request<PaginatedResponse<StudentResponse>>(
      query ? `/students?${query}` : "/students"
    );
  },
  studentCreate: (input: { name: string; rollNumber?: string; phone?: string }) =>
    request<StudentResponse>("/students", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  studentUpdate: (
    id: string,
    input: { name?: string; rollNumber?: string | null; phone?: string | null }
  ) =>
    request<StudentResponse>(`/students/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  schedules: (classId?: string) =>
    request<ScheduleResponse[]>(classId ? `/schedules?classId=${classId}` : "/schedules"),
  scheduleCreate: (input: {
    classId: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
  }) =>
    request<ScheduleResponse[]>("/schedules", {
      method: "POST",
      body: JSON.stringify({ schedules: [input] }),
    }),
  attendanceSessions: (filters?: { classId?: string; date?: string; page?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.classId) params.set("classId", filters.classId);
    if (filters?.date) params.set("date", filters.date);
    if (filters?.page) params.set("page", String(filters.page));
    if (filters?.limit) params.set("limit", String(filters.limit));
    const query = params.toString();
    return request<PaginatedResponse<AttendanceSessionResponse>>(
      query ? `/attendance/sessions?${query}` : "/attendance/sessions"
    );
  },
  attendanceCreateSession: (input: { classId: string; date: string }) =>
    request<AttendanceSessionResponse>("/attendance/sessions", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  attendanceSession: (id: string) =>
    request<AttendanceSessionDetailResponse>(`/attendance/sessions/${id}`),
  attendanceMark: (sessionId: string, input: AttendanceBatchRequest) =>
    request<AttendanceBatchResult>(`/attendance/sessions/${sessionId}/mark`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  attendanceHistory: (studentId: string, classId?: string, page?: number, limit?: number) => {
    const params = new URLSearchParams();
    if (classId) params.set("classId", classId);
    if (page) params.set("page", String(page));
    if (limit) params.set("limit", String(limit));
    const query = params.toString();
    return request<PaginatedResponse<AttendanceHistoryItem>>(
      query ? `/attendance/students/${studentId}/history?${query}` : `/attendance/students/${studentId}/history`
    );
  },
  announcements: (page?: number, limit?: number) => {
    const params = new URLSearchParams();
    if (page) params.set("page", String(page));
    if (limit) params.set("limit", String(limit));
    const query = params.toString();
    return request<PaginatedResponse<AnnouncementResponse>>(
      query ? `/announcements?${query}` : "/announcements"
    );
  },
  announcementCreate: (input: {
    title: string;
    body: string;
    attachmentUrl?: string;
    isPinned?: boolean;
  }) =>
    request<ParentFeedResponse["announcements"][number]>("/announcements", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  announcementRead: (id: string) =>
    request<{ read: boolean }>(`/announcements/${id}/read`, { method: "POST" }),
  reportsAttendance: (month: string) =>
    request<unknown>(`/reports/attendance/summary?month=${month}`),
  reportsClassStats: (classId: string) =>
    request<unknown>(`/reports/classes/${classId}/stats`),
  parentFeed: (page?: number, limit?: number) => {
    const params = new URLSearchParams();
    if (page) params.set("page", String(page));
    if (limit) params.set("limit", String(limit));
    const query = params.toString();
    return request<ParentFeedResponse>(
      query ? `/parent/feed?${query}` : "/parent/feed"
    );
  },
  parentChildren: () => request<StudentResponse[]>("/parent/children"),
  parentChildClasses: (studentId: string) =>
    request<ClassResponse[]>(`/parent/children/${studentId}/classes`),
  parentChildAttendance: (studentId: string, classId?: string, page?: number, limit?: number) => {
    const params = new URLSearchParams();
    if (classId) params.set("classId", classId);
    if (page) params.set("page", String(page));
    if (limit) params.set("limit", String(limit));
    const query = params.toString();
    return request<PaginatedResponse<AttendanceHistoryItem>>(
      query ? `/parent/children/${studentId}/attendance?${query}` : `/parent/children/${studentId}/attendance`
    );
  },
  registerFcm: (input: { fcmToken: string; platform: "ios" | "android" | "web" }) =>
    request("/devices/fcm", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createPaymentOrder: () =>
    request("/payments/orders", {
      method: "POST",
      body: JSON.stringify({ plan: "pro_yearly" }),
    }),
};
