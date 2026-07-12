import 'dotenv/config';
import { db } from './packages/db/src/index.js';
import { users, deviceTokens } from './packages/db/src/schema/index.js';
import { eq, and, isNull } from 'drizzle-orm';

const rows = await db
  .select({ id: users.id, role: users.role, tenantId: users.tenantId, name: users.name })
  .from(users)
  .where(isNull(users.deletedAt))
  .limit(10);
console.log('Users:', JSON.stringify(rows, null, 2));

const tokens = await db
  .select()
  .from(deviceTokens)
  .limit(10);
console.log('Device tokens:', JSON.stringify(tokens, null, 2));
