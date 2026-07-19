// ─── JWT Claims ───
export interface JWTPayload {
  userId: string;
  tenantId: string;
  role: string;
  plan: string;
  activeTenantId?: string;
  tenants?: { tenantId: string; role: string; status: string }[];
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
  idToken?: string;
  phone?: string;
  otp?: string;
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

// ─── Phase 2: Auth Response Types ───
export interface OTPSendResponse {
  sent: boolean;
  expiresIn: number; // seconds
}

// FIX: Parents cannot join multiple tenants — breaks multi-school families
export interface OTPVerifyResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    role: string;
    tenantId: string;
    tenants?: {
      tenantId: string;
      role: string;
      status: string;
      tenantName: string;
    }[];
  };
  isNewUser: boolean;
}

export type OTPVerifyResult =
  | {
      type: "existing_user";
      accessToken: string;
      refreshToken: string;
      user: {
        id: string;
        role: string;
        tenantId: string;
        tenants?: {
          tenantId: string;
          role: string;
          status: string;
          tenantName: string;
        }[];
      };
      isNewUser: boolean;
    }
  | {
      type: "new_user";
      registrationToken: string;
    };

export interface RefreshResponse {
  accessToken: string;
  refreshToken?: string;
}

export interface InviteResolveResponse {
  tenantName: string;
  logoUrl: string | null;
  brandColor: string;
}

export interface TenantUpdateRequest {
  name?: string;
  logoUrl?: string;
  brandColor?: string;
}

export interface InviteGenerateResponse {
  inviteCode: string;
}

// ─── Phase 3: Core Data Response Types ───
export interface ClassResponse {
  id: string;
  tenantId: string;
  name: string;
  subject: string | null;
  teacherName: string | null;
  chatMode: string;
  studentCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudentResponse {
  id: string;
  tenantId: string;
  name: string;
  rollNumber: string | null;
  parentId: string | null;
  phone: string | null;
  isMonitor?: boolean;
  enrolledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleResponse {
  id: string;
  tenantId: string;
  classId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceTokenResponse {
  id: string;
  userId: string;
  tenantId: string;
  fcmToken: string;
  platform: string | null;
  updatedAt: Date;
}

// ─── Phase 4: Attendance & Announcements Response Types ───
export interface AttendanceSessionResponse {
  id: string;
  tenantId: string;
  classId: string;
  date: string;
  status: string;
  totalPresent: number | null;
  totalAbsent: number | null;
  totalStudents: number | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface AttendanceRecordResponse {
  id: string;
  studentId: string;
  studentName: string;
  rollNumber: string | null;
  status: string;
  markedAt: Date;
}

export interface RechargeOrderResponse {
  id: string;
  amount: number;
  amountPaise: number;
  credits: number;
  currency: string;
  receipt: string;
  paymentUrl: string;
  status: string;
  notes?: Record<string, string>;
}

export interface AttendanceSessionDetailResponse extends AttendanceSessionResponse {
  records: AttendanceRecordResponse[];
}

export interface AttendanceBatchResult {
  marked: number;
  present: number;
  absent: number;
}

export interface AttendanceHistoryItem {
  id: string;
  sessionId: string;
  classId: string;
  date: string;
  status: string;
  markedAt: Date;
}

export interface AnnouncementResponse {
  id: string;
  tenantId: string;
  authorId: string;
  title: string;
  body: string;
  attachmentUrl: string | null;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface ParentFeedResponse {
  announcements: AnnouncementResponse[];
  meta?: PaginationMeta;
  unread: number;
  total: number;
}

// ─── Chat Response Types ───
export interface ChatRoomResponse {
  id: string;
  name: string;
  type: "classroom" | "teacher_channel" | "direct_message";
  subtitle: string;
  chatMode?: "announcement" | "open";
  unreadCount: number;
  updatedAt: string | Date;
  otherParticipant?: {
    id: string;
    name: string;
    role: string;
  };
}

export interface ChatAttachment {
  type: "image" | "video" | "document";
  url: string;
  name: string;
  size: number;
}

export interface ChatMessageResponse {
  id: string;
  roomId: string;
  roomType: "classroom" | "teacher_channel" | "direct_message";
  senderId: string;
  senderName: string | null;
  senderRole: string | null;
  content: string;
  attachments: ChatAttachment[] | null;
  isPinned: boolean;
  mentions: string[] | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  deletedAt: string | Date | null;
}

export interface ChatReceiptResponse {
  userId: string;
  userName: string | null;
  userRole: string | null;
  readAt: string | Date;
}


