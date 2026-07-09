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
  ChatRoomResponse,
  ChatMessageResponse,
  ChatAttachment,
  ChatReceiptResponse,
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

let refreshPromise: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const { refreshToken, setTokens, clear } = sessionStore.getState();
  if (!refreshToken) {
    await clear();
    return false;
  }
  try {
    const refreshed = await request<RefreshResponse>(
      "/auth/refresh",
      {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      },
      false
    );
    await setTokens(refreshed.accessToken, refreshed.refreshToken || refreshToken);
    return true;
  } catch {
    await clear();
    if (typeof window !== "undefined" && window.location) {
      window.location.href = "/auth";
    }
    return false;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const { accessToken } = sessionStore.getState();
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  // 15s timeout to prevent hanging on cold starts
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (fetchErr: any) {
    clearTimeout(timeoutId);
    if (fetchErr?.name === 'AbortError') {
      throw new ApiError('TIMEOUT', 'Request timed out. The server may be waking up — please try again.', 0);
    }
    throw fetchErr;
  }
  clearTimeout(timeoutId);

  if (response.status === 401 && retry) {
    refreshPromise = refreshPromise || doRefresh().finally(() => { refreshPromise = null; });
    const ok = await refreshPromise;
    if (!ok) {
      throw new ApiError("AUTH_EXPIRED", "Session expired. Please log in again.", 401);
    }
    return request<T>(path, options, false);
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
  otpVerify: (input: {
    idToken?: string;
    phone?: string;
    otp?: string;
  }): Promise<OTPVerifyResult> =>
    request<OTPVerifyResult>("/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  register: (input: {
    registrationToken: string;
    role: "school_admin" | "teacher" | "parent";
    consentAccepted: boolean;
    inviteCode?: string;
    schoolName?: string;
    designation?: string;
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
    input: {
      name?: string;
      subject?: string | null;
      teacherName?: string | null;
      chatMode?: "announcement" | "open";
    }
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
  attendanceMarkAllPresent: (sessionId: string, idempotencyKey?: string) =>
    request<AttendanceBatchResult>(`/attendance/sessions/${sessionId}/mark-all-present`, {
      method: "POST",
      body: JSON.stringify({ idempotencyKey }),
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
  whatsappSessionCreate: (phone: string): Promise<{ id: string; token: string; expiresIn: number }> =>
    request<{ id: string; token: string; expiresIn: number }>("/auth/whatsapp/session", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),
  whatsappSessionGet: (id: string): Promise<{ verified: boolean; isExpired: boolean }> =>
    request<{ verified: boolean; isExpired: boolean }>(`/auth/whatsapp/session/${id}?t=${Date.now()}`),
  whatsappVerify: (input: { id: string; token: string; inviteCode?: string }): Promise<OTPVerifyResult> =>
    request<OTPVerifyResult>("/auth/whatsapp/verify", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // ─── Native Chat Endpoints ───
  chatRooms: (): Promise<ChatRoomResponse[]> =>
    request<ChatRoomResponse[]>("/chat/rooms"),

  chatMessages: (
    roomId: string,
    roomType: "classroom" | "teacher_channel" | "direct_message"
  ): Promise<ChatMessageResponse[]> =>
    request<ChatMessageResponse[]>(`/chat/rooms/${roomId}/messages?roomType=${roomType}`),

  chatSendMessage: (
    roomId: string,
    input: {
      roomType: "classroom" | "teacher_channel" | "direct_message";
      content: string;
      attachments?: ChatAttachment[];
      mentions?: string[];
    }
  ): Promise<ChatMessageResponse> =>
    request<ChatMessageResponse>(`/chat/rooms/${roomId}/messages`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  chatMarkRead: (roomId: string): Promise<{ marked: number }> =>
    request<{ marked: number }>(`/chat/rooms/${roomId}/read`, {
      method: "POST",
    }),

  chatPinMessage: (messageId: string): Promise<{ success: boolean }> =>
    request<{ success: boolean }>(`/chat/messages/${messageId}/pin`, {
      method: "PUT",
    }),

  chatUnpinMessage: (messageId: string): Promise<{ success: boolean }> =>
    request<{ success: boolean }>(`/chat/messages/${messageId}/pin`, {
      method: "DELETE",
    }),

  chatDeleteMessage: (messageId: string): Promise<{ success: boolean }> =>
    request<{ success: boolean }>(`/chat/messages/${messageId}`, {
      method: "DELETE",
    }),

  chatGetReceipts: (messageId: string): Promise<ChatReceiptResponse[]> =>
    request<ChatReceiptResponse[]>(`/chat/messages/${messageId}/receipts`),

  chatBlockUser: (blockedUserId: string): Promise<any> =>
    request<any>("/chat/blocks", {
      method: "POST",
      body: JSON.stringify({ blockedUserId }),
    }),

  chatUnblockUser: (blockedUserId: string): Promise<any> =>
    request<any>(`/chat/blocks/${blockedUserId}`, {
      method: "DELETE",
    }),

  chatListBlocked: (): Promise<any[]> =>
    request<any[]>("/chat/blocks"),

  // ─── Classroom Archive Endpoints ───
  getClassArchive: (classId: string): Promise<any[]> =>
    request<any[]>(`/classes/${classId}/archive`),
  syncChatAttachments: (classId: string): Promise<{ syncedCount: number; files: any[] }> =>
    request<{ syncedCount: number; files: any[] }>(`/classes/${classId}/archive/sync-chat`, {
      method: "POST",
    }),
  uploadArchiveFile: (
    classId: string,
    file: { uri: string; name: string; type: string },
    category: string,
    onProgress?: (progress: number) => void
  ): Promise<any> => {
    return new Promise((resolve, reject) => {
      const { accessToken } = sessionStore.getState();
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE_URL}/classes/${classId}/archive/upload`);

      if (accessToken) {
        xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
      }
      xhr.setRequestHeader("Accept", "application/json");

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            onProgress(progress);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const res = JSON.parse(xhr.responseText);
            resolve(res.data);
          } catch (e) {
            reject(new Error("Invalid JSON response from server"));
          }
        } else {
          try {
            const res = JSON.parse(xhr.responseText);
            reject(new ApiError(res.error?.code || "UPLOAD_ERROR", res.error?.message || "Upload failed", xhr.status));
          } catch {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => {
        reject(new Error("Network error during file upload"));
      };

      const formData = new FormData();
      formData.append("file", {
        uri: file.uri,
        name: file.name,
        type: file.type,
      } as any);
      formData.append("category", category);

      xhr.send(formData);
    });
  },
  deleteArchiveFile: (classId: string, fileId: string): Promise<any> =>
    request<any>(`/classes/${classId}/archive/${fileId}`, {
      method: "DELETE",
    }),

  // ─── Walt AI Doubt Solver ───
  askWalt: (roomId: string, question: string): Promise<any> =>
    request<any>(`/chat/rooms/${roomId}/walt`, {
      method: "POST",
      body: JSON.stringify({ question }),
    }),

  // ─── Billing & Subscriptions ───
  getBillingDashboard: (): Promise<any> =>
    request<any>("/billing/dashboard"),
  subscribeBilling: (payload: { planType: "tuition" | "school"; waltAiEnabled: boolean }): Promise<any> =>
    request<any>("/billing/subscribe", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  simulatePaymentWebhook: (payload: any): Promise<any> =>
    request<any>("/billing/webhook", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ─── Bulletins ───
  getBulletins: (filters?: { classId?: string }): Promise<any[]> => {
    const params = new URLSearchParams();
    if (filters?.classId) params.set("classId", filters.classId);
    const query = params.toString();
    return request<any[]>(query ? `/bulletins?${query}` : "/bulletins");
  },
  markBulletinRead: (bulletinId: string): Promise<any> =>
    request<any>(`/bulletins/${bulletinId}/read`, {
      method: "POST",
    }),
  getBulletinReceipts: (bulletinId: string): Promise<any> =>
    request<any>(`/bulletins/${bulletinId}/receipts`),
  createBulletin: (payload: { title: string; body: string; category: string; classId?: string }): Promise<any> =>
    request<any>("/bulletins", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ─── Class Promotions ───
  promoteAll: (payload: {
    academicYear: string;
    promotionRules: { fromClassId: string; toClassId: string }[];
    graduatingClassIds: string[];
  }): Promise<any> =>
    request<any>("/admin/promote-all", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  promotionHistory: (): Promise<any[]> =>
    request<any[]>("/admin/promotion-history"),
};
