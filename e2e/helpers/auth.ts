import { expect, type Page } from '@playwright/test';

export const ACCOUNTS = {
  admin: { email: 'admin@acme.test', password: 'Admin123!', home: '/dashboard' },
  teacher: { email: 'teacher@acme.test', password: 'Teacher123!', home: '/dashboard' },
  student: { email: 'student1@acme.test', password: 'Student123!', home: '/me/exams' },
} as const;

export type Role = keyof typeof ACCOUNTS;

/**
 * Log in via the real login form and wait until we land on the role's home.
 * Field ids (#email/#password) and the "Sign in" button are stable in
 * LoginPage.tsx.
 */
export const login = async (page: Page, role: Role): Promise<void> => {
  const acct = ACCOUNTS[role];
  await page.goto('/login');
  await page.locator('#email').fill(acct.email);
  await page.locator('#password').fill(acct.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
  await expect(page).toHaveURL(new RegExp(escapeRe(acct.home)));
};

/** Open the user menu and sign out. Returns once we're back on /login. */
export const logout = async (page: Page): Promise<void> => {
  // The top-bar user block button carries the "Hello," greeting on >=md.
  await page.locator('button:has-text("Hello,")').first().click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/login$/, { timeout: 15_000 });
};

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Pattern for the OLD broken question rendering: "(DESCRIPTIVE) 402c5d3c-..."
 * — a question type tag followed by a raw UUID. Students must NEVER see this.
 */
export const BROKEN_STEM_RE = /\([A-Z/ ]+\)\s+[0-9a-f]{8}-?[0-9a-f]{0,4}/;
