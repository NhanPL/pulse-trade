"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type KeyboardEvent } from "react";

import { Badge } from "../ui/Badge";
import { classNames } from "../ui/class-names";
import { BrandLink } from "./BrandLink";
import { connectionPresentation, getNavigationItems, type ConnectionStatus } from "./header-config";

export type MobileNavProps = {
  connectionStatus?: ConnectionStatus;
  isAuthenticated: boolean;
};

export function MobileNav({ connectionStatus, isAuthenticated }: MobileNavProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const items = getNavigationItems(isAuthenticated);
  const connection = connectionStatus ? connectionPresentation[connectionStatus] : undefined;

  function closeMenu() {
    setIsOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      closeMenu();
    }
  }

  return (
    <header
      className="relative z-30 border-b border-border-subtle bg-header/95 backdrop-blur md:hidden"
      onKeyDown={handleKeyDown}
    >
      <div className="flex h-14 items-center justify-between gap-3 px-4">
        <BrandLink compact />

        <div className="flex items-center gap-2">
          {connection ? (
            <Badge
              aria-label={`Market data: ${connection.label}`}
              className="h-8 px-2"
              showDot
              variant={connection.variant}
            >
              {connection.label}
            </Badge>
          ) : null}
          <button
            type="button"
            aria-controls="mobile-primary-navigation"
            aria-expanded={isOpen}
            aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
            className="grid size-10 place-items-center rounded-lg border border-border bg-surface-interactive text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            onClick={() => setIsOpen((open) => !open)}
          >
            <span aria-hidden="true" className="relative block h-4 w-5">
              <span
                className={classNames(
                  "absolute left-0 top-0 h-0.5 w-5 bg-current transition-transform",
                  isOpen && "translate-y-[7px] rotate-45",
                )}
              />
              <span
                className={classNames(
                  "absolute left-0 top-[7px] h-0.5 w-5 bg-current transition-opacity",
                  isOpen && "opacity-0",
                )}
              />
              <span
                className={classNames(
                  "absolute bottom-0 left-0 h-0.5 w-5 bg-current transition-transform",
                  isOpen && "-translate-y-[7px] -rotate-45",
                )}
              />
            </span>
          </button>
        </div>
      </div>

      {isOpen ? (
        <>
          <button
            type="button"
            aria-label="Close navigation menu"
            className="fixed inset-0 top-14 z-0 bg-backdrop"
            onClick={closeMenu}
          />
          <nav
            id="mobile-primary-navigation"
            aria-label="Primary navigation"
            className="absolute inset-x-0 top-full z-10 border-b border-border bg-surface-elevated p-4 shadow-overlay"
          >
            <ul className="grid gap-1">
              {items.map((item) => {
                const isActive = item.matches(pathname);

                return (
                  <li key={item.href}>
                    <Link
                      aria-current={isActive ? "page" : undefined}
                      className={classNames(
                        "flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                        isActive
                          ? "bg-surface-selected text-brand"
                          : "text-foreground-secondary hover:bg-surface-hover hover:text-foreground",
                      )}
                      href={item.href}
                      onClick={closeMenu}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>

            {!isAuthenticated ? (
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border-subtle pt-4">
                <Link
                  className="flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface-interactive text-sm font-semibold text-foreground-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  href="/login"
                  onClick={closeMenu}
                >
                  Log in
                </Link>
                <Link
                  className="flex min-h-11 items-center justify-center rounded-lg bg-brand text-sm font-semibold text-foreground-inverse shadow-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  href="/register"
                  onClick={closeMenu}
                >
                  Create account
                </Link>
              </div>
            ) : null}
          </nav>
        </>
      ) : null}
    </header>
  );
}
