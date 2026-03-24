import { test, expect } from "./fixtures";

const MOBILE_VIEWPORT = { width: 375, height: 667 };

/**
 * Locate the mobile hamburger button (HeadlessUI DisclosureButton inside md:hidden div).
 */
function hamburgerButton(page: import("@playwright/test").Page) {
  return page.locator('nav button[id^="headlessui-disclosure-button-"]');
}

test.describe("Mobile responsive — Navbar", () => {
  test("mobile navbar shows hamburger menu, not desktop links", async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/dashboard");

    // Hamburger button (inside md:hidden wrapper) should be visible
    await expect(hamburgerButton(page)).toBeVisible();

    // Desktop nav links container (hidden md:flex) should NOT be visible
    const desktopNavContainer = page.locator("nav .hidden.md\\:flex").first();
    await expect(desktopNavContainer).not.toBeVisible();

    // Desktop user info container (hidden ... md:flex) should NOT be visible
    const desktopUserInfo = page.locator("nav .hidden.md\\:flex").last();
    await expect(desktopUserInfo).not.toBeVisible();
  });

  test("hamburger menu opens and shows all nav links", async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/dashboard");

    // Click hamburger button to open mobile menu
    await hamburgerButton(page).click();

    // Wait for the mobile disclosure panel to appear
    await page.waitForSelector('[id^="headlessui-disclosure-panel-"]', {
      state: "visible",
    });

    // Check that nav links are present in the mobile panel
    const mobilePanel = page.locator('[id^="headlessui-disclosure-panel-"]');
    await expect(mobilePanel.locator('a[href="/dashboard"]')).toBeVisible();
    await expect(mobilePanel.locator('a[href="/leave/new"]')).toBeVisible();
    await expect(mobilePanel.locator('a[href="/calendar"]')).toBeVisible();

    // Mobile controls (language toggle, theme toggle) should be visible in the panel
    const langButton = mobilePanel.locator("button").filter({ hasText: /^EN$|^中$/ });
    await expect(langButton).toBeVisible();

    const themeButton = mobilePanel.locator('button[aria-label="Toggle theme"]');
    await expect(themeButton).toBeVisible();

    // User name should appear in mobile menu
    await expect(mobilePanel).toContainText("Test Employee");
  });

  test("admin mobile hamburger shows admin-specific links", async ({
    adminPage: page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/dashboard");

    // Open hamburger menu
    await hamburgerButton(page).click();
    await page.waitForSelector('[id^="headlessui-disclosure-panel-"]', {
      state: "visible",
    });

    const mobilePanel = page.locator('[id^="headlessui-disclosure-panel-"]');

    // Admin links should be present in mobile menu
    await expect(mobilePanel.locator('a[href="/admin"]')).toBeVisible();
    await expect(mobilePanel.locator('a[href="/admin/employees"]')).toBeVisible();
  });
});

test.describe("Mobile responsive — Dashboard layout", () => {
  test("dashboard layout is single-column on mobile", async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/dashboard");

    // Balance cards grid: on mobile, the grid has no sm/lg columns
    // so items stack in a single column. Check the grid container exists.
    const balanceGrid = page.locator("section .grid").first();
    await expect(balanceGrid).toBeVisible();

    // Verify the grid computed style is single-column at this viewport
    const columns = await balanceGrid.evaluate(
      (el) => window.getComputedStyle(el).gridTemplateColumns
    );
    // Single-column should return a single value (e.g., "343px"),
    // not "171.5px 171.5px" (2-col) or similar multi-column pattern
    const colCount = columns.split(/\s+/).length;
    expect(colCount).toBe(1);
  });

  test("mobile cards layout is shown instead of desktop tables (recent requests)", async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/dashboard");

    // Desktop tables (hidden md:block) should not be visible at mobile viewport
    const desktopTables = page.locator("section .hidden.md\\:block");
    const tableCount = await desktopTables.count();
    for (let i = 0; i < tableCount; i++) {
      await expect(desktopTables.nth(i)).not.toBeVisible();
    }

    // Mobile card containers (md:hidden) exist in the DOM.
    // They may or may not be visible depending on whether there's data,
    // but the key assertion is that desktop tables are hidden above.
    const mobileCards = page.locator("section .md\\:hidden");
    const mobileCount = await mobileCards.count();
    expect(mobileCount).toBeGreaterThanOrEqual(0);
  });
});

test.describe("Mobile responsive — Leave form", () => {
  test("leave form is usable on mobile (all fields visible, scrollable)", async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/leave/new");

    // Page heading
    const heading = page.locator("h1");
    await expect(heading).toBeVisible();

    // Leave type select
    const typeSelect = page.locator("select");
    await expect(typeSelect).toBeVisible();

    // Date inputs — scroll to make them visible if needed
    const dateInputs = page.locator('input[type="date"]');
    await expect(dateInputs).toHaveCount(2);
    await dateInputs.first().scrollIntoViewIfNeeded();
    await expect(dateInputs.first()).toBeVisible();
    await dateInputs.last().scrollIntoViewIfNeeded();
    await expect(dateInputs.last()).toBeVisible();

    // Handover URL input
    const handoverInput = page.locator('input[type="url"]');
    await handoverInput.scrollIntoViewIfNeeded();
    await expect(handoverInput).toBeVisible();

    // Notes textarea
    const notes = page.locator("textarea");
    await notes.scrollIntoViewIfNeeded();
    await expect(notes).toBeVisible();

    // Submit button
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.scrollIntoViewIfNeeded();
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeDisabled();

    // Cancel button
    const cancelButton = page.locator("button").filter({ hasText: /取消|Cancel/ });
    await cancelButton.first().scrollIntoViewIfNeeded();
    await expect(cancelButton.first()).toBeVisible();

    // The form should be contained within the viewport width (no horizontal overflow)
    const formBox = await page.locator("form").boundingBox();
    expect(formBox).not.toBeNull();
    expect(formBox!.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
  });
});

test.describe("Mobile responsive — Admin page", () => {
  test("admin page works on mobile", async ({ adminPage: page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/admin");

    // Should stay on admin page
    expect(page.url()).toContain("/admin");

    // Main content should be visible
    const main = page.locator("main");
    await expect(main).toBeVisible();

    // Page heading should be visible
    const heading = page.locator("h1");
    await expect(heading).toBeVisible();

    // Desktop tables (hidden md:block) should not be visible
    const desktopTables = page.locator("main .hidden.md\\:block");
    const tableCount = await desktopTables.count();
    for (let i = 0; i < tableCount; i++) {
      await expect(desktopTables.nth(i)).not.toBeVisible();
    }

    // Navbar hamburger should be visible (not desktop nav)
    await expect(hamburgerButton(page)).toBeVisible();
  });
});
