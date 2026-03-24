import { test, expect } from "./fixtures";

test.describe("Auth redirects", () => {
  test("unauthenticated user visiting /dashboard is redirected to /login", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.waitForURL("**/login");
    expect(page.url()).toContain("/login");
  });

  test("unauthenticated user visiting /admin is redirected to /login", async ({
    page,
  }) => {
    await page.goto("/admin");
    await page.waitForURL("**/login");
    expect(page.url()).toContain("/login");
  });

  test("unauthenticated user visiting /leave/new is redirected to /login", async ({
    page,
  }) => {
    await page.goto("/leave/new");
    await page.waitForURL("**/login");
    expect(page.url()).toContain("/login");
  });

  test("unauthenticated user visiting / is redirected to /login", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForURL("**/login");
    expect(page.url()).toContain("/login");
  });

  test("unauthenticated API call is rejected", async ({ request }) => {
    const response = await request.get("/api/leave");
    // Should be 401 (no session) or 429 (rate limited) — never 200
    expect(response.ok()).toBe(false);
    const json = await response.json();
    expect(json.success).toBe(false);
  });
});

// These tests use the `request` API (no JS execution) to verify
// that proxy.ts returns server-side redirects BEFORE client JS runs.
// This catches proxy.ts regressions that layout.tsx would mask in browser tests.
test.describe("Proxy-level server redirects (no JS)", () => {
  test("GET /dashboard without session → server redirects to /login", async ({
    request,
  }) => {
    const response = await request.get("/dashboard");
    // request follows redirects; final URL should be /login (server-side redirect)
    // If proxy is broken, URL stays /dashboard (200 with HTML, JS redirect won't run)
    expect(response.url()).toContain("/login");
  });

  test("GET /admin without session → server redirects to /login", async ({
    request,
  }) => {
    const response = await request.get("/admin");
    expect(response.url()).toContain("/login");
  });

  test("GET /leave/new without session → server redirects to /login", async ({
    request,
  }) => {
    const response = await request.get("/leave/new");
    expect(response.url()).toContain("/login");
  });

  test("GET /calendar without session → server redirects to /login", async ({
    request,
  }) => {
    const response = await request.get("/calendar");
    expect(response.url()).toContain("/login");
  });

  test("GET / without session → server redirects (not 200 on /)", async ({
    request,
  }) => {
    const response = await request.get("/");
    // Root should redirect to /dashboard then to /login
    expect(response.url()).not.toMatch(/\/$/);
  });

  test("GET /api/leave without session → 401 JSON (not redirect)", async ({
    request,
  }) => {
    const response = await request.get("/api/leave");
    // API routes return 401 JSON, not redirect — verify it's not 200
    expect(response.ok()).toBe(false);
  });
});

test.describe("Login page", () => {
  test("renders login page with title and connect button", async ({
    page,
  }) => {
    await page.goto("/login");
    // Title should be visible
    await expect(page.locator("h1")).toContainText("Dinngo");
    // The appkit connect button should be present
    await expect(page.locator("appkit-connect-button")).toBeAttached();
  });

  test("authenticated user visiting /login is redirected to /dashboard", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/login");
    await authenticatedPage.waitForURL("**/dashboard", { timeout: 10000 });
    expect(authenticatedPage.url()).toContain("/dashboard");
  });
});

test.describe("Root redirect", () => {
  test("authenticated user visiting / is redirected to /dashboard", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/");
    await authenticatedPage.waitForURL("**/dashboard", { timeout: 10000 });
    expect(authenticatedPage.url()).toContain("/dashboard");
  });
});
