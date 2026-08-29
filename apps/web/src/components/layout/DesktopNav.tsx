"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { classNames } from "../ui/class-names";
import { getNavigationItems } from "./header-config";

export type DesktopNavProps = {
  isAuthenticated: boolean;
};

export function DesktopNav({ isAuthenticated }: DesktopNavProps) {
  const pathname = usePathname();
  const items = getNavigationItems(isAuthenticated);

  return (
    <nav aria-label="Primary navigation" className="hidden h-full items-center md:flex">
      <ul className="flex h-full items-center gap-1">
        {items.map((item) => {
          const isActive = item.matches(pathname);

          return (
            <li className="h-full" key={item.href}>
              <Link
                aria-current={isActive ? "page" : undefined}
                className={classNames(
                  "relative flex h-full items-center px-3 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus",
                  isActive
                    ? "text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-brand"
                    : "text-foreground-muted hover:text-foreground",
                )}
                href={item.href}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
