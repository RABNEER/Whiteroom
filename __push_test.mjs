import dotenv from 'dotenv';
dotenv.config();
import pg from 'pg';
import { SignJWT } from 'jose';
import crypto from 'crypto';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

// User with device tokens
const targetUserId = '1c7b8f0fd90dcbecd0281';
const targetTenantId = 'ee3593b6de4f8eb88c138';

try {
  // Check if user exists and isn't deleted
  const userResult = await pool.query(
    'SELECT id, role, name, deleted_at FROM users WHERE id = $1',
    [targetUserId]
  );
  console.log('User:', JSON.stringify(userResult.rows[0] || 'NOT FOUND', null, 2));

  // Count device tokens for this user
  const tokenResult = await pool.query(
    'SELECT count(*) as cnt FROM device_tokens WHERE user_id = $1',
    [targetUserId]
  );
  console.log('Device tokens count:', tokenResult.rows[0].cnt);

  if (userResult.rows.length > 0 && !userResult.rows[0].deleted_at) {
    // Generate HS256 JWT using access secret
    const key = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);
    const claims = {
      userId: targetUserId,
      tenantId: targetTenantId,
      role: userResult.rows[0].role || 'school_admin',
      plan: 'pro',
      activeTenantId: targetTenantId,
    };
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);
    console.log('\nHS256 JWT token:');
    console.log(token);
  } else {
    console.log('\nUser not found or deleted, trying other users with device tokens...');
    // Find any non-deleted user with device tokens
    const result = await pool.query(`
      SELECT u.id, u.role, u.tenant_id, u.name
      FROM users u
      INNER JOIN device_tokens dt ON dt.user_id = u.id
      WHERE u.deleted_at IS NULL
      LIMIT 5
    `);
    console.log('Users with device tokens:', JSON.stringify(result.rows, null, 2));
  }
} catch(e) {
  console.error('Error:', e.message);
}
await pool.end();
