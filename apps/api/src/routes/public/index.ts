import { Hono } from "hono";
import { html } from "hono/html";
import { db } from "../../lib/db.js";
import { tenants, eq, and } from "@whiteroom/db";

const publicRoutes = new Hono();

// ─── Universal / App Link Validation ───

publicRoutes.get("/.well-known/apple-app-site-association", (c) => {
  return c.json({
    applinks: {
      apps: [],
      details: [
        {
          appID: "YOUR_TEAM_ID.app.whiteroom.mobile",
          paths: ["/invite/*"],
        },
      ],
    },
  });
});

publicRoutes.get("/.well-known/assetlinks.json", (c) => {
  return c.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "app.whiteroom.mobile",
        sha256_cert_fingerprints: [
          "FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C"
        ],
      },
    },
  ]);
});

// ─── Invite Landing Page ───

publicRoutes.get("/invite/:code", async (c) => {
  const code = c.req.param("code");

  if (!code || code.length !== 6) {
    return c.html(
      html`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Invalid Invite | Whiteroom</title>
          <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
          <style>
            body { font-family: 'Plus Jakarta Sans', sans-serif; background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
            .card { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.1); padding: 3rem; border-radius: 24px; max-width: 480px; }
            h1 { font-size: 2.2rem; margin-bottom: 1rem; background: linear-gradient(to right, #6366f1, #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            p { color: #94a3b8; font-size: 1.1rem; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Invalid Invite Link</h1>
            <p>This invite link is not valid. Please check with the person who sent it.</p>
          </div>
        </body>
        </html>
      `,
      400
    );
  }

  const [tenant] = await db
    .select({
      name: tenants.name,
      logoUrl: tenants.logoUrl,
      brandColor: tenants.brandColor,
    })
    .from(tenants)
    .where(
      and(
        eq(tenants.inviteCode, code.toUpperCase()),
        eq(tenants.isActive, true)
      )
    )
    .limit(1);

  if (!tenant) {
    return c.html(
      html`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Invite Not Found | Whiteroom</title>
          <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
          <style>
            body { font-family: 'Plus Jakarta Sans', sans-serif; background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
            .card { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.1); padding: 3rem; border-radius: 24px; max-width: 480px; }
            h1 { font-size: 2.2rem; margin-bottom: 1rem; background: linear-gradient(to right, #6366f1, #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            p { color: #94a3b8; font-size: 1.1rem; line-height: 1.6; }
            a { color: #6366f1; text-decoration: none; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Invite Not Found</h1>
            <p>This invite code has expired or does not exist. Ask your school for a new invite link.</p>
            <p><a href="https://whiteroom.co.in">Go to Whiteroom</a></p>
          </div>
        </body>
        </html>
      `,
      404
    );
  }

  const brandColor = tenant.brandColor || "#4F46E5";

  return c.html(
    html`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Join ${tenant.name} on Whiteroom</title>
        <meta name="description" content="You've been invited to join ${tenant.name} on Whiteroom — classroom administration made simple.">
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
          :root { --brand: ${brandColor}; --brand-grad: linear-gradient(135deg, ${brandColor} 0%, #a855f7 100%); }
          * { box-sizing: border-box; }
          body { font-family: 'Plus Jakarta Sans', sans-serif; background: linear-gradient(135deg, #090d16 0%, #0f172a 100%); color: #f1f5f9; min-height: 100vh; margin: 0; display: flex; flex-direction: column; align-items: center; }
          header { width: 100%; padding: 1.5rem 2rem; max-width: 1200px; }
          .logo-text { font-weight: 800; font-size: 1.5rem; background: var(--brand-grad); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
          .container { flex: 1; display: flex; align-items: center; justify-content: center; width: 100%; padding: 2rem; }
          .card { background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.08); border-radius: 28px; padding: 3rem; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); animation: fadeIn 0.8s ease-out; }
          @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
          .avatar { width: 100px; height: 100px; border-radius: 24px; background: var(--brand-grad); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem; font-weight: 800; font-size: 2.5rem; color: white; overflow: hidden; }
          .avatar img { width: 100%; height: 100%; object-fit: cover; }
          h2 { font-size: 2rem; font-weight: 800; margin: 0 0 0.25rem; letter-spacing: -0.5px; }
          .subtitle { color: #94a3b8; margin-bottom: 2rem; font-size: 1rem; }
          .open-btn { display: inline-flex; align-items: center; gap: 0.5rem; background: var(--brand-grad); color: white; border: none; padding: 1rem 2.5rem; border-radius: 16px; font-size: 1.1rem; font-weight: 700; cursor: pointer; text-decoration: none; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 8px 20px rgba(99, 102, 241, 0.3); }
          .open-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(99, 102, 241, 0.4); }
          .fallback { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.06); }
          .fallback p { color: #64748b; font-size: 0.85rem; margin: 0 0 1rem; }
          .dl-btn { display: inline-block; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #e2e8f0; padding: 0.75rem 1.5rem; border-radius: 12px; font-weight: 600; font-size: 0.9rem; text-decoration: none; margin: 0.25rem; transition: background 0.2s; }
          .dl-btn:hover { background: rgba(255,255,255,0.1); }
          footer { width: 100%; padding: 2rem; text-align: center; color: #64748b; font-size: 0.9rem; border-top: 1px solid rgba(255,255,255,0.03); }
        </style>
      </head>
      <body>
        <header><div class="logo-text">WHITEROOM</div></header>
        <div class="container">
          <div class="card">
            <div class="avatar">
              ${tenant.logoUrl ? html`<img src="${tenant.logoUrl}" alt="${tenant.name}">` : tenant.name.substring(0, 1).toUpperCase()}
            </div>
            <h2>${tenant.name}</h2>
            <p class="subtitle">You've been invited to join on Whiteroom</p>
            <a class="open-btn" href="whiteroom://auth?inviteCode=${code}">
              Open in Whiteroom
            </a>
            <div class="fallback">
              <p>Don't have the app yet?</p>
              <a class="dl-btn" href="#">Download for iOS</a>
              <a class="dl-btn" href="#">Download for Android</a>
            </div>
          </div>
        </div>
        <footer>
          <p>Powered by <a href="https://whiteroom.co.in" style="color:#e2e8f0;text-decoration:none;font-weight:600;">Whiteroom</a></p>
        </footer>
      </body>
      </html>
    `
  );
});

publicRoutes.get("/s/:slug", async (c) => {
  const slug = c.req.param("slug");

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);

  if (!tenant || !tenant.isActive) {
    return c.html(
      html`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Institution Not Found | Whiteroom</title>
          <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
          <style>
            body {
              font-family: 'Plus Jakarta Sans', sans-serif;
              background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
              color: #f8fafc;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              text-align: center;
            }
            .card {
              background: rgba(30, 41, 59, 0.7);
              backdrop-filter: blur(16px);
              border: 1px solid rgba(255, 255, 255, 0.1);
              padding: 3rem;
              border-radius: 24px;
              box-shadow: 0 20px 40px rgba(0,0,0,0.3);
              max-width: 480px;
            }
            h1 { font-size: 2.2rem; margin-bottom: 1rem; background: linear-gradient(to right, #6366f1, #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            p { color: #94a3b8; font-size: 1.1rem; line-height: 1.6; }
            a { color: #6366f1; text-decoration: none; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Institution Not Found</h1>
            <p>The school or tuition center you are looking for does not exist or has been deactivated.</p>
            <p><a href="https://whiteroom.co.in">Go to Whiteroom</a></p>
          </div>
        </body>
        </html>
      `,
      404
    );
  }

  const badges = tenant.complianceBadges || [];

  return c.html(
    html`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${tenant.name} | Whiteroom Public Profile</title>
        <meta name="description" content="Discover ${tenant.name}, verified B2B classroom administration powered by Whiteroom. Details, address, and compliance information.">
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
          :root {
            --brand-color: ${tenant.brandColor || "#4F46E5"};
            --brand-gradient: linear-gradient(135deg, ${tenant.brandColor || "#4F46E5"} 0%, #a855f7 100%);
          }
          body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            background: linear-gradient(135deg, #090d16 0%, #0f172a 100%);
            color: #f1f5f9;
            min-height: 100vh;
            margin: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
          }
          header {
            width: 100%;
            padding: 1.5rem 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-sizing: border-box;
            max-width: 1200px;
          }
          .logo-text {
            font-weight: 800;
            font-size: 1.5rem;
            background: var(--brand-gradient);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
          .container {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            padding: 2rem;
            box-sizing: border-box;
          }
          .profile-card {
            background: rgba(15, 23, 42, 0.6);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 28px;
            padding: 3rem;
            max-width: 640px;
            width: 100%;
            text-align: center;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            animation: fadeIn 0.8s ease-out;
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .avatar-container {
            width: 110px;
            height: 110px;
            border-radius: 30px;
            background: var(--brand-gradient);
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 2rem;
            font-weight: 800;
            font-size: 2.5rem;
            color: white;
            box-shadow: 0 10px 25px rgba(99, 102, 241, 0.35);
            overflow: hidden;
          }
          .avatar-image {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          h2 {
            font-size: 2.2rem;
            font-weight: 800;
            margin: 0 0 0.5rem;
            color: #ffffff;
            letter-spacing: -0.5px;
          }
          .status-tag {
            display: inline-block;
            padding: 0.35rem 1rem;
            border-radius: 99px;
            font-size: 0.85rem;
            font-weight: 600;
            background: rgba(16, 185, 129, 0.15);
            color: #34d399;
            border: 1px solid rgba(52, 211, 153, 0.2);
            margin-bottom: 2rem;
          }
          .info-group {
            display: flex;
            flex-direction: column;
            gap: 1.25rem;
            text-align: left;
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid rgba(255, 255, 255, 0.04);
            padding: 2rem;
            border-radius: 20px;
            margin-bottom: 2.5rem;
          }
          .info-item {
            display: flex;
            align-items: flex-start;
            gap: 1rem;
          }
          .info-label {
            font-weight: 700;
            color: #94a3b8;
            min-width: 80px;
          }
          .info-value {
            color: #e2e8f0;
            line-height: 1.5;
          }
          .badge-row {
            display: flex;
            justify-content: center;
            gap: 1rem;
            flex-wrap: wrap;
            margin-bottom: 1rem;
          }
          .badge {
            background: rgba(99, 102, 241, 0.1);
            border: 1px solid rgba(99, 102, 241, 0.2);
            color: #818cf8;
            padding: 0.5rem 1.25rem;
            border-radius: 12px;
            font-size: 0.85rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          footer {
            width: 100%;
            padding: 2rem;
            text-align: center;
            color: #64748b;
            font-size: 0.9rem;
            border-top: 1px solid rgba(255, 255, 255, 0.03);
          }
          .whiteroom-link {
            color: #e2e8f0;
            text-decoration: none;
            font-weight: 600;
            transition: color 0.2s;
          }
          .whiteroom-link:hover {
            color: var(--brand-color);
          }
        </style>
      </head>
      <body>
        <header>
          <div class="logo-text">WHITEROOM</div>
        </header>

        <div class="container">
          <div class="profile-card">
            <div class="avatar-container">
              ${
                tenant.logoUrl
                  ? html`<img src="${tenant.logoUrl}" alt="${tenant.name}" class="avatar-image">`
                  : tenant.name.substring(0, 1).toUpperCase()
              }
            </div>
            <h2>${tenant.name}</h2>
            <div class="status-tag">Verified Institution</div>

            <div class="info-group">
              ${
                tenant.address
                  ? html`
                    <div class="info-item">
                      <span class="info-label">Address</span>
                      <span class="info-value">${tenant.address}</span>
                    </div>
                  `
                  : ""
              }
              ${
                tenant.contactEmail
                  ? html`
                    <div class="info-item">
                      <span class="info-label">Contact</span>
                      <span class="info-value">${tenant.contactEmail}</span>
                    </div>
                  `
                  : ""
              }

            </div>

            ${
              badges.length > 0
                ? html`
                  <div style="margin-bottom: 1rem; font-weight: 600; color: #94a3b8; font-size: 0.9rem;">COMPLIANCE & SECURITY</div>
                  <div class="badge-row">
                    ${badges.map((b) => html`<span class="badge">${b}</span>`)}
                  </div>
                `
                : ""
            }
          </div>
        </div>

        <footer>
          <p>Powered by <a href="https://whiteroom.co.in" class="whiteroom-link">Whiteroom B2B Administration</a></p>
        </footer>
      </body>
      </html>
    `
  );
});

export { publicRoutes };
