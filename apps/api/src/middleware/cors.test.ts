import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { corsMiddleware } from "./cors.js";

// We need to mock env before importing cors middleware because it's imported at the top level
vi.mock("../lib/env.js", () => ({
  env: {
    NODE_ENV: "production", // Test in production mode where origins are actually checked
    MOBILE_WEB_URL: "https://mobile.whiteroom.co.in",
    ADMIN_URL: "https://admin.whiteroom.co.in",
  },
}));

describe("corsMiddleware", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.use("*", corsMiddleware());
    app.get("/", (c) => c.text("ok"));
  });

  const expectOriginAllowed = async (origin: string, allowed: boolean) => {
    const res = await app.request("/", {
      headers: {
        Origin: origin,
      },
    });

    // Hono CORS middleware returns Access-Control-Allow-Origin header if allowed
    const acao = res.headers.get("Access-Control-Allow-Origin");
    if (allowed) {
      expect(acao).toBe(origin);
    } else {
      // If not allowed, it might return "" or not include the header or include a different origin
      // Wait, our origin function returns "" if not allowed. So the header should not match the origin.
      expect(acao).not.toBe(origin);
    }
  };

  it("should allow exact match origins", async () => {
    await expectOriginAllowed("http://localhost:3001", true);
    await expectOriginAllowed("https://apps.whiteroom.co.in", true);
    await expectOriginAllowed("https://mobile.whiteroom.co.in", true);
  });

  it("should block unlisted exact match origins", async () => {
    await expectOriginAllowed("https://evil.com", false);
    await expectOriginAllowed("http://localhost:9999", false);
  });

  it("should allow valid wildcard IP origins", async () => {
    await expectOriginAllowed("http://192.168.1.50:8081", true);
    await expectOriginAllowed("http://192.168.0.100:8081", true);
  });

  it("should block invalid wildcard IP origins (prevent dot bypass)", async () => {
    await expectOriginAllowed("http://192.168.1.50.evil.com:8081", false);
    await expectOriginAllowed("http://192.168.1:8081", false);
  });

  it("should allow valid wildcard domain origins", async () => {
    await expectOriginAllowed("https://my-app.netlify.app", true);
    await expectOriginAllowed("https://my-app.up.railway.app", true);
  });

  it("should block invalid wildcard domain origins (prevent malicious subdomains or paths)", async () => {
    // These used to pass with `.*` and unescaped dots!
    await expectOriginAllowed("https://attacker.netlify.app", true); // Wait, this is valid by definition of wildcard if we just have [a-zA-Z0-9_-]+. Wait, if it's "attacker.netlify.app", it IS a valid netlify app. But attacker.com/netlify.app shouldn't be.
    await expectOriginAllowed("https://attacker-netlify.app", false);
    await expectOriginAllowed("https://attacker.com/netlify.app", false);
    await expectOriginAllowed("https://attacker.com?.netlify.app", false);
    await expectOriginAllowed("https://my-app.netlify.app.evil.com", false);
    await expectOriginAllowed("https://sub.my-app.netlify.app", false); // Our restricted regex [a-zA-Z0-9_-]+ won't match the inner dot, which is secure
  });
});
