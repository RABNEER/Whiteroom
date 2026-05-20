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
  OTPSendResponse,
  ParentFeedResponse,
  RefreshResponse,
  ScheduleResponse,
  StudentResponse,
  TenantInfo,
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
  otpSend: (phone: string) =>
    request<OTPSendResponse>("/auth/otp/send", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),
  otpVerify: (input: {
    phone: string;
    otp: string;
    inviteCode?: string;
    studentName?: string;
    rollNumber?: string;
  }) =>
    request<OTPVerifyResponse>("/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  logout: () => request<{ loggedOut: boolean }>("/auth/logout", { method: "POST" }),
  tenantMe: () => request<TenantInfo>("/tenants/me"),
  tenantUpdate: (input: { name?: string; logoUrl?: string; brandColor?: string }) =>
    request<TenantInfo>("/tenants/me", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  inviteGenerate: () =>
    request<InviteGenerateResponse>("/invite", { method: "POST" }),
  inviteResolve: (code: string) =>
    request<InviteResolveResponse>(`/invite/${encodeURIComponent(code)}`),
  classes: () => request<ClassResponse[]>("/classes"),
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
  classStudents: (classId: string) =>
    request<StudentResponse[]>(`/classes/${classId}/students`),
  classAddStudents: (classId: string, studentIds: string[]) =>
    request<{ enrolled: number; skipped: number }>(`/classes/${classId}/students`, {
      method: "POST",
      body: JSON.stringify({ studentIds }),
    }),
  students: () => request<StudentResponse[]>("/students"),
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
  attendanceSessions: (filters?: { classId?: string; date?: string }) => {
    const params = new URLSearchParams();
    if (filters?.classId) params.set("classId", filters.classId);
    if (filters?.date) params.set("date", filters.date);
    const query = params.toString();
    return request<AttendanceSessionResponse[]>(
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
  attendanceHistory: (studentId: string, classId?: string) =>
    request<AttendanceHistoryItem[]>(
      classId
        ? `/attendance/students/${studentId}/history?classId=${classId}`
        : `/attendance/students/${studentId}/history`
    ),
  announcements: () => request<ParentFeedResponse["announcements"]>("/announcements"),
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
  parentFeed: () => request<ParentFeedResponse>("/parent/feed"),
  parentChildren: () => request<StudentResponse[]>("/parent/children"),
  parentChildClasses: (studentId: string) =>
    request<ClassResponse[]>(`/parent/children/${studentId}/classes`),
  parentChildAttendance: (studentId: string, classId?: string) =>
    request<AttendanceHistoryItem[]>(
      classId
        ? `/parent/children/${studentId}/attendance?classId=${classId}`
        : `/parent/children/${studentId}/attendance`
    ),
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
