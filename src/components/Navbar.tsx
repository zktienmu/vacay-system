"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Disclosure, DisclosureButton, DisclosurePanel, Transition } from "@headlessui/react";
import { useSession } from "@/hooks/useSession";

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leave/new", label: "New Leave" },
  { href: "/calendar", label: "Calendar" },
];

const adminLinks = [
  { href: "/admin", label: "Review" },
  { href: "/admin/employees", label: "Employees" },
];

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

export default function Navbar() {
  const pathname = usePathname();
  const { session, logout } = useSession();
  const isAdmin = session?.role === "admin";

  const allLinks = isAdmin ? [...navLinks, ...adminLinks] : navLinks;

  function isActive(href: string): boolean {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <Disclosure as="nav" className="border-b border-gray-200 bg-white shadow-sm">
      {({ open }) => (
        <>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
              {/* Logo */}
              <div className="flex items-center">
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 text-xl font-bold text-gray-900"
                >
                  Vaca {"\uD83D\uDC04"}
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
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>

              {/* User info (desktop) */}
              <div className="hidden items-center gap-3 md:flex">
                {session && (
                  <>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {session.name}
                      </p>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          isAdmin
                            ? "bg-purple-100 text-purple-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {session.role}
                      </span>
                    </div>
                    <button
                      onClick={logout}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      Logout
                    </button>
                  </>
                )}
              </div>

              {/* Mobile menu button */}
              <div className="md:hidden">
                <DisclosureButton className="inline-flex items-center justify-center rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900">
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
              <div className="space-y-1 border-t border-gray-200 px-4 pb-3 pt-2">
                {allLinks.map((link) => (
                  <DisclosureButton
                    key={link.href}
                    as={Link}
                    href={link.href}
                    className={`block rounded-lg px-3 py-2 text-base font-medium ${
                      isActive(link.href)
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  >
                    {link.label}
                  </DisclosureButton>
                ))}
                {session && (
                  <div className="mt-3 border-t border-gray-200 pt-3">
                    <div className="mb-2 flex items-center gap-2 px-3">
                      <p className="text-sm font-medium text-gray-900">
                        {session.name}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          isAdmin
                            ? "bg-purple-100 text-purple-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {session.role}
                      </span>
                    </div>
                    <DisclosureButton
                      as="button"
                      onClick={logout}
                      className="block w-full rounded-lg px-3 py-2 text-left text-base font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    >
                      Logout
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
