import { describe, expect, it, vi, beforeEach } from "vitest";
import { logAuditEvent } from "../audit.js";
import { db } from "../../lib/db.js";
import { auditLogs } from "@whiteroom/db";

// Mock the db insert
vi.mock("../../lib/db.js", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue(true),
    })),
  },
}));

describe("logAuditEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should successfully log an audit event", async () => {
    await logAuditEvent({
      tenantId: "tenant-1",
      action: "test_action",
      resource: "test_resource",
    });

    expect(db.insert).toHaveBeenCalledWith(auditLogs);
  });

  it("should swallow errors and not throw (fire-and-forget)", async () => {
    (db.insert as any).mockImplementationOnce(() => ({
      values: vi.fn().mockRejectedValue(new Error("DB Error")),
    }));

    // Should not throw
    await expect(
      logAuditEvent({
        tenantId: "tenant-1",
        action: "test_action",
        resource: "test_resource",
      })
    ).resolves.not.toThrow();
  });
});
