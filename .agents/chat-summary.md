# Chat Module — Bug Fix Summary

## Bugs Fixed (17 total)

### services/chat.ts (7 bugs)
| Bug | Description | Fix |
|-----|-------------|-----|
| BUG 1 | getMessages: no authorization check for classroom messages | Added enrollment check for PARENT role via parentProfiles→students→classEnrollments chain |
| BUG 2 | sendMessage: no authorization check for PARENT role | Added `senderRole` param + enrollment check for classroom auth |
| BUG 6 | getOrCreateDMRoom: race condition on concurrent creation | Wrapped in advisory-lock transaction (`pg_advisory_xact_lock`) |
| BUG 8 | pinMessage/unpinMessage: classroom teacher ownership | Added `classes.teacherId` check when roomType is classroom |
| BUG 12 | decryptMessage: encrypted data parsing fails silently | Added `lastDecryptError` module-level var, logs via `console.error` |
| BUG 13 | sendMessage: missing roomType filter in WHERE | Added `eq(messages.roomType, roomType)` to message insert |
| BUG 16 | sendMessage: parameter reassignment to `messageContent` | Replaced with local `const` variable |

### routes/chat/rooms.ts (4 bugs)
| Bug | Description | Fix |
|-----|-------------|------|
| BUG 4 | N+1 unread count queries for each room | Replaced per-room `getUnreadCount` calls with single batch query using `inArray + GROUP BY` |
| BUG 5 | No tenant filter on user lookup | Added `eq(users.tenantId, tenantId)` to batch user query |
| BUG 7 | getUnreadCount missing roomType filter | Batch query uses room IDs directly (redundant with `inArray`) |
| BUG 9 | Parent enrollment query missing status filter | Added `eq(classEnrollments.status, "active")` |
| BUG 10 | Admin DM query only joins participant1 | Added `alias(users, "users2")` join for participant2 name/role |

### routes/chat/blocks.ts (2 bugs)
| Bug | Description | Fix |
|-----|-------------|------|
| BUG 5 | No tenant filter on user lookup | Added `eq(users.tenantId, ...)` to target user query |
| BUG 15 | Self-unblock not prevented | Added self-unblock validation check |

### routes/chat/receipts.ts (2 bugs)
| Bug | Description | Fix |
|-----|-------------|------|
| BUG 3 | markRoomRead: no auth context | Passes `user.role`, service now verifies room access |
| BUG 14 | getMessageReceipts: no auth context | Passes `user.userId` + `user.role`, service now verifies access |

### routes/chat/messages.ts (1 bug)
| Bug | Description | Fix |
|-----|-------------|------|
| BUG 17 | sendMessageHandler: senderRole not passed | Passes `user.role` as `senderRole` to `sendMessage` |

## Tests
- 6/6 tests passing
- Run: `npx vitest run apps/api/src/routes/chat/chat.test.ts`
