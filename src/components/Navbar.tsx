"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Disclosure, DisclosureButton, DisclosurePanel, Transition } from "@headlessui/react";
import { useDisconnect } from "wagmi";
import { useSession } from "@/hooks/useSession";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/lib/i18n/context";

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      stroke="currentColor"
    >
      {open ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
      )}
    </svg>
  );
}

function SunIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
    </svg>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const { session, logout } = useSession();
  const { disconnectAsync } = useDisconnect();
  const { theme, toggleTheme, mounted } = useTheme();
  const { t, locale, setLocale } = useTranslation();

  const handleLogout = async () => {
    await disconnectAsync().catch(() => {});
    await logout();
  };
  const isAdmin = session?.role === "admin";
  const isManager = session?.is_manager === true;

  const navLinks = [
    { href: "/dashboard", label: t("nav.dashboard") },
    { href: "/leave/new", label: t("nav.newLeave") },
    { href: "/calendar", label: t("nav.calendar") },
  ];

  const managerLinks = [
    { href: "/admin", label: t("nav.admin") },
    { href: "/admin/holidays", label: locale === "zh-TW" ? "假日" : "Holidays" },
    { href: "/admin/reports", label: locale === "zh-TW" ? "報表" : "Reports" },
  ];

  const adminLinks = [
    { href: "/admin", label: t("nav.admin") },
    { href: "/admin/employees", label: t("nav.employees") },
    { href: "/admin/holidays", label: locale === "zh-TW" ? "假日" : "Holidays" },
    { href: "/admin/reports", label: locale === "zh-TW" ? "報表" : "Reports" },
    { href: "/admin/transition", label: locale === "zh-TW" ? "資料轉移" : "Transition" },
  ];

  const allLinks = isAdmin
    ? [...navLinks, ...adminLinks]
    : isManager
      ? [...navLinks, ...managerLinks]
      : navLinks;

  function isActive(href: string): boolean {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  function handleLocaleToggle() {
    setLocale(locale === "zh-TW" ? "en" : "zh-TW");
  }

  return (
    <Disclosure as="nav" className="border-b border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      {({ open }) => (
        <>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
              {/* Logo */}
              <div className="flex items-center">
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-gray-100"
                >
                  Dinngo 請假系統
                </Link>
              </div>

              {/* Desktop nav */}
              <div className="hidden md:flex md:items-center md:gap-1">
                {allLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive(link.href)
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>

              {/* User info + controls (desktop) */}
              <div className="hidden items-center gap-3 md:flex">
                {/* Language toggle */}
                <button
                  onClick={handleLocaleToggle}
                  className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  {locale === "zh-TW" ? "EN" : "中"}
                </button>

                {/* Theme toggle */}
                {mounted && (
                  <button
                    onClick={toggleTheme}
                    className="rounded-lg border border-gray-300 p-1.5 text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                    aria-label="Toggle theme"
                  >
                    {theme === "dark" ? <SunIcon /> : <MoonIcon />}
                  </button>
                )}

                {session && (
                  <>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {session.name}
                      </p>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          isAdmin
                            ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        }`}
                      >
                        {session.role}
                      </span>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      {t("nav.logout")}
                    </button>
                  </>
                )}
              </div>

              {/* Mobile menu button */}
              <div className="md:hidden">
                <DisclosureButton className="inline-flex items-center justify-center rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100">
                  <HamburgerIcon open={open} />
                </DisclosureButton>
              </div>
            </div>
          </div>

          {/* Mobile menu */}
          <Transition
            as={Fragment}
            enter="transition duration-150 ease-out"
            enterFrom="opacity-0 -translate-y-1"
            enterTo="opacity-100 translate-y-0"
            leave="transition duration-100 ease-in"
            leaveFrom="opacity-100 translate-y-0"
            leaveTo="opacity-0 -translate-y-1"
          >
            <DisclosurePanel className="md:hidden">
              <div className="space-y-1 border-t border-gray-200 px-4 pb-3 pt-2 dark:border-gray-700">
                {allLinks.map((link) => (
                  <DisclosureButton
                    key={link.href}
                    as={Link}
                    href={link.href}
                    className={`block rounded-lg px-3 py-2 text-base font-medium ${
                      isActive(link.href)
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                    }`}
                  >
                    {link.label}
                  </DisclosureButton>
                ))}

                {/* Mobile controls */}
                <div className="mt-3 flex items-center gap-2 border-t border-gray-200 px-3 pt-3 dark:border-gray-700">
                  <button
                    onClick={handleLocaleToggle}
                    className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    {locale === "zh-TW" ? "EN" : "中"}
                  </button>
                  {mounted && (
                    <button
                      onClick={toggleTheme}
                      className="rounded-lg border border-gray-300 p-1.5 text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                      aria-label="Toggle theme"
                    >
                      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
                    </button>
                  )}
                </div>

                {session && (
                  <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
                    <div className="mb-2 flex items-center gap-2 px-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {session.name}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          isAdmin
                            ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        }`}
                      >
                        {session.role}
                      </span>
                    </div>
                    <DisclosureButton
                      as="button"
                      onClick={handleLogout}
                      className="block w-full rounded-lg px-3 py-2 text-left text-base font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                    >
                      {t("nav.logout")}
                    </DisclosureButton>
                  </div>
                )}
              </div>
            </DisclosurePanel>
          </Transition>
        </>
      )}
    </Disclosure>
  );
}
