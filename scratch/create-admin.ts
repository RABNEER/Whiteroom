import postgres from "postgres";
import { config } from "dotenv";
import { SignJWT } from "jose";

config({ path: "D:\\Whiteroom\\.env" });

const accessSecret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET);

async function signAccessToken(payload: any): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(accessSecret);
}

async function signRefreshToken(payload: any): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(refreshSecret);
}

async function run() {
  const url = process.env.DATABASE_URL!;
  const client = postgres(url);
  try {
    // 1. Create a tenant
    const tenantId = "tnnt_admin_test_01";
    const tenantSlug = "admin-test-school-01";
    const inviteCode = "ADM123";
    
    // Check if tenant already exists
    const [existingTenant] = await client`
      SELECT id FROM tenants WHERE id = ${tenantId};
    `;
    if (!existingTenant) {
      await client`
        INSERT INTO tenants (id, name, slug, invite_code, phone, brand_color)
        VALUES (${tenantId}, 'Admin Test School', ${tenantSlug}, ${inviteCode}, '+919999991111', '#4F46E5');
      `;
      console.log("Created tenant tnnt_admin_test_01");
    }

    // 2. Create school admin user
    const userId = "usr_admin_test_01";
    const phone = "+919999991111";
    
    const [existingUser] = await client`
      SELECT id FROM users WHERE id = ${userId};
    `;
    if (!existingUser) {
      await client`
        INSERT INTO users (id, phone, role, tenant_id)
        VALUES (${userId}, ${phone}, 'school_admin', ${tenantId});
      `;
      console.log("Created user usr_admin_test_01");
    }

    // 3. Create user tenant mapping
    const [existingMapping] = await client`
      SELECT id FROM user_tenants WHERE user_id = ${userId} AND tenant_id = ${tenantId};
    `;
    if (!existingMapping) {
      await client`
        INSERT INTO user_tenants (id, user_id, tenant_id, role, status, active_tenant)
        VALUES ('ut_admin_test_01', ${userId}, ${tenantId}, 'school_admin', 'active', true);
      `;
      console.log("Created user_tenant mapping");
    }

    // 4. Create school admin profile
    const [existingProfile] = await client`
      SELECT id FROM school_admins WHERE user_id = ${userId};
    `;
    if (!existingProfile) {
      await client`
        INSERT INTO school_admins (id, user_id, tenant_id, designation)
        VALUES ('sa_admin_test_01', ${userId}, ${tenantId}, 'Principal');
      `;
      console.log("Created school admin profile");
    }

    // 5. Generate tokens
    const jwtPayload = {
      userId,
      tenantId,
      role: 'school_admin',
      plan: 'free',
      activeTenantId: tenantId,
      tenants: [{
        tenantId,
        role: 'school_admin',
        status: 'active'
      }]
    };

    const accessToken = await signAccessToken(jwtPayload);
    const refreshToken = await signRefreshToken(jwtPayload);

    // Save refresh token hash in user table
    const crypto = await import("node:crypto");
    const hash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    await client`
      UPDATE users SET refresh_token = ${hash} WHERE id = ${userId};
    `;

    const sessionObj = {
      accessToken,
      refreshToken,
      user: {
        id: userId,
        role: 'school_admin',
        tenantId,
        tenants: [{
          tenantId,
          role: 'school_admin',
          status: 'active',
          tenantName: 'Admin Test School'
        }]
      },
      isNewUser: false
    };

    console.log("\n--- SESSION JSON OBJECT ---");
    console.log(JSON.stringify(sessionObj));
    console.log("---------------------------\n");

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

run();
