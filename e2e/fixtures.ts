import { test as base, type Page } from "@playwright/test";
import { createSessionCookie, mockAuthApi } from "./helpers/auth";

type Fixtures = {
  authenticatedPage: Page;
  adminPage: Page;
  managerPage: Page;
};

export const test = base.extend<Fixtures>({
  authenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const cookie = await createSessionCookie("employee");
    await context.addCookies([cookie]);
    const page = context.pages()[0] ?? (await context.newPage());
    await mockAuthApi(page, "employee");
    await use(page);
    await context.close();
  },

  adminPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const cookie = await createSessionCookie("admin");
    await context.addCookies([cookie]);
    const page = context.pages()[0] ?? (await context.newPage());
    await mockAuthApi(page, "admin");
    await use(page);
    await context.close();
  },

  managerPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const cookie = await createSessionCookie("manager");
    await context.addCookies([cookie]);
    const page = context.pages()[0] ?? (await context.newPage());
    await mockAuthApi(page, "manager");
    await use(page);
    await context.close();
  },
});

export { expect } from "@playwright/test";
