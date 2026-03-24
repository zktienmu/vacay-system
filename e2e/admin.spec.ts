import { test, expect } from "./fixtures";

test.describe("Admin access", () => {
  test("admin can access /admin page", async ({ adminPage: page }) => {
    await page.goto("/admin");
    // Should stay on admin page (not redirected)
    expect(page.url()).toContain("/admin");
    // Should show the page content
    const main = page.locator("main");
    await expect(main).toBeVisible();
  });

  test("admin can access /admin/employees", async ({ adminPage: page }) => {
    await page.goto("/admin/employees");
    expect(page.url()).toContain("/admin/employees");
    const main = page.locator("main");
    await expect(main).toBeVisible();
  });

  test("admin can access /admin/holidays", async ({ adminPage: page }) => {
    await page.goto("/admin/holidays");
    expect(page.url()).toContain("/admin/holidays");
    const main = page.locator("main");
    await expect(main).toBeVisible();
  });

  test("admin can access /admin/reports", async ({ adminPage: page }) => {
    await page.goto("/admin/reports");
    expect(page.url()).toContain("/admin/reports");
    const main = page.locator("main");
    await expect(main).toBeVisible();
  });

  test("admin navbar shows admin-specific links", async ({
    adminPage: page,
  }) => {
    await page.goto("/dashboard");
    // Admin should see admin link in navbar
    const adminLink = page.locator('nav a[href="/admin"]');
    await expect(adminLink).toBeVisible();
    // Admin should see employees link
    const employeesLink = page.locator('nav a[href="/admin/employees"]');
    await expect(employeesLink).toBeVisible();
  });
});

test.describe("Employee access restrictions", () => {
  test("employee navbar does NOT show admin links", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/dashboard");
    // Regular employee should not see admin links in navbar
    const adminLink = page.locator('nav a[href="/admin"]');
    await expect(adminLink).not.toBeVisible();
    const employeesLink = page.locator('nav a[href="/admin/employees"]');
    await expect(employeesLink).not.toBeVisible();
  });
});

test.describe("Manager access", () => {
  test("manager navbar shows admin review link", async ({
    managerPage: page,
  }) => {
    await page.goto("/dashboard");
    // Manager should see the admin (review) link
    const adminLink = page.locator('nav a[href="/admin"]');
    await expect(adminLink).toBeVisible();
    // But NOT the employees management link
    const employeesLink = page.locator('nav a[href="/admin/employees"]');
    await expect(employeesLink).not.toBeVisible();
  });
});
