// ─── User Roles ───
export const UserRole = {
  TEACHER: "teacher",
  PARENT: "parent",
  SUPER_ADMIN: "super_admin",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

// ─── Subscription Plans ───
export const PlanTier = {
  FREE: "free",
  PRO: "pro",
} as const;

export type PlanTier = (typeof PlanTier)[keyof typeof PlanTier];

// ─── Attendance Status ───
export const AttendanceStatus = {
  PRESENT: "present",
  ABSENT: "absent",
  LATE: "late",
} as const;

export type AttendanceStatus =
  (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

// ─── Session Status ───
export const SessionStatus = {
  LIVE: "live",
  DONE: "done",
} as const;

export type SessionStatus =
  (typeof SessionStatus)[keyof typeof SessionStatus];

// ─── Limits ───
export const Limits = {
  FREE_MAX_STUDENTS: 50,
  FREE_MAX_CLASSES: 5,
  PRO_MAX_STUDENTS: 500,
  PRO_MAX_CLASSES: 50,
  OTP_RATE_LIMIT_PER_HOUR: 3,
  OTP_EXPIRY_SECONDS: 300, // 5 minutes
  JWT_ACCESS_EXPIRY: "15m",
  JWT_REFRESH_EXPIRY: "30d",
  MAX_ATTACHMENT_SIZE_MB: 10,
  INVITE_CODE_LENGTH: 6,
} as const;

// ─── Days of Week ───
export const DayOfWeek = {
  MONDAY: "monday",
  TUESDAY: "tuesday",
  WEDNESDAY: "wednesday",
  THURSDAY: "thursday",
  FRIDAY: "friday",
  SATURDAY: "saturday",
  SUNDAY: "sunday",
} as const;

export type DayOfWeek = (typeof DayOfWeek)[keyof typeof DayOfWeek];
