// ─── Schemas ───
export { tenants } from "./schema/tenants.js";
export { users } from "./schema/users.js";
export { teacherProfiles } from "./schema/teacher-profiles.js";
export { parentProfiles } from "./schema/parent-profiles.js";
export { students } from "./schema/students.js";
export { classes } from "./schema/classes.js";
export { classEnrollments } from "./schema/class-enrollments.js";
export { attendanceSessions } from "./schema/attendance-sessions.js";
export { attendanceRecords } from "./schema/attendance-records.js";
export { announcements } from "./schema/announcements.js";
export { announcementReads } from "./schema/announcement-reads.js";
export { schedules } from "./schema/schedules.js";
export { notifications } from "./schema/notifications.js";
export { deviceTokens } from "./schema/device-tokens.js";
export { consentLogs } from "./schema/consent-logs.js";
export { subscriptions } from "./schema/subscriptions.js";
export { otpAttempts, otpLockouts } from "./schema/otp-attempts.js";
export { userTenants } from "./schema/user-tenants.js";
export { reportsCache } from "./schema/reports-cache.js";
export { idempotencyKeys } from "./schema/idempotency-keys.js";
export { registrationTokens } from "./schema/registration-tokens.js";
export { whatsappSessions } from "./schema/whatsapp-sessions.js";

// ─── Utilities ───
export { createId } from "./utils.js";

export {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  sql,
} from "drizzle-orm";
export { drizzle } from "drizzle-orm/postgres-js";
