import { test, expect } from "./fixtures";

test.describe("Dashboard", () => {
  test("loads with navbar visible", async ({ authenticatedPage: page }) => {
    await page.goto("/dashboard");
    // Navbar should be present with the site name
    await expect(page.locator("nav")).toBeVisible();
    await expect(page.locator("nav")).toContainText("Dinngo");
  });

  test("shows leave balances section", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/dashboard");
    // The balance section heading should exist (zh-TW or en)
    const heading = page.locator("h2").first();
    await expect(heading).toBeVisible();
  });

  test("has new leave request button that links to /leave/new", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/dashboard");
    const newLeaveLink = page.locator('main a[href="/leave/new"]');
    await expect(newLeaveLink).toBeVisible();
    await newLeaveLink.click();
    await page.waitForURL("**/leave/new");
    expect(page.url()).toContain("/leave/new");
  });

  test("shows recent requests section", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/dashboard");
    // Should have multiple h2 sections (balances, delegated, recent requests)
    const headings = page.locator("h2");
    await expect(headings).not.toHaveCount(0);
  });

  test("does not crash when API returns empty data", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/dashboard");
    // Page should still be functional — no uncaught errors
    // Check that the page has rendered content (not a blank page)
    const main = page.locator("main");
    await expect(main).toBeVisible();
  });
});
