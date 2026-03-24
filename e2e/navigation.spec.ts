import { test, expect } from "./fixtures";

test.describe("Navigation", () => {
  test("navbar links navigate correctly", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/dashboard");

    // Click "New Leave" link in navbar
    const newLeaveLink = page.locator('nav a[href="/leave/new"]');
    await expect(newLeaveLink).toBeVisible();
    await newLeaveLink.click();
    await page.waitForURL("**/leave/new");
    expect(page.url()).toContain("/leave/new");

    // Click "Calendar" link in navbar
    const calendarLink = page.locator('nav a[href="/calendar"]');
    await expect(calendarLink).toBeVisible();
    await calendarLink.click();
    await page.waitForURL("**/calendar");
    expect(page.url()).toContain("/calendar");

    // Click logo/title to go back to dashboard
    const dashboardLink = page.locator('nav a[href="/dashboard"]').first();
    await dashboardLink.click();
    await page.waitForURL("**/dashboard");
    expect(page.url()).toContain("/dashboard");
  });

  test("admin navbar has all expected links", async ({
    adminPage: page,
  }) => {
    await page.goto("/dashboard");

    // Common links (use .first() since logo also links to /dashboard)
    await expect(page.locator('nav a[href="/dashboard"]').first()).toBeVisible();
    await expect(page.locator('nav a[href="/leave/new"]')).toBeVisible();
    await expect(page.locator('nav a[href="/calendar"]')).toBeVisible();

    // Admin-specific links
    await expect(page.locator('nav a[href="/admin"]')).toBeVisible();
    await expect(page.locator('nav a[href="/admin/employees"]')).toBeVisible();
  });

  test("language toggle button exists", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/dashboard");

    // Language toggle button (shows "EN" or "中")
    const langButton = page.locator("nav button").filter({ hasText: /^EN$|^中$/ });
    await expect(langButton).toBeVisible();
  });

  test("theme toggle button exists", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/dashboard");

    // Theme toggle has aria-label
    const themeButton = page.locator('nav button[aria-label="Toggle theme"]');
    await expect(themeButton).toBeVisible();
  });

  test("user name is displayed in navbar", async ({
    adminPage: page,
  }) => {
    await page.goto("/dashboard");

    // The session name should appear in navbar
    await expect(page.locator("nav")).toContainText("Test Admin");
  });

  test("user role badge is displayed in navbar", async ({
    adminPage: page,
  }) => {
    await page.goto("/dashboard");

    // Role badge should show "admin"
    await expect(page.locator("nav")).toContainText("admin");
  });
});
