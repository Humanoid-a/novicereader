"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { useState } from "react";

type AppMenuItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

const menuItems: AppMenuItem[] = [
  {
    label: "Home page",
    href: "/",
    icon: HomeIcon,
  },
  {
    label: "Help",
    href: "/help",
    icon: HelpIcon,
  },
];

function MenuIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m7 7 10 10M17 7 7 17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HomeIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.5 11.2 12 5l7.5 6.2v7.3a.5.5 0 0 1-.5.5h-4.2v-5.2H9.2V19H5a.5.5 0 0 1-.5-.5v-7.3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HelpIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M9.8 9.4a2.2 2.2 0 0 1 4.3.6c0 1.8-2.1 1.9-2.1 3.6M12 16.8h.01"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AppMenu() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-300"
      >
        <MenuIcon className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close menu backdrop"
            className="absolute inset-0 bg-slate-950/20"
            onClick={() => setIsOpen(false)}
          />

          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[82vw] flex-col border-r border-slate-200 bg-white shadow-xl">
            <div className="flex h-12 items-center justify-between border-b border-slate-100 px-4">
              <div className="text-sm font-semibold text-slate-900">
                NoviceReader
              </div>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            <nav className="flex flex-col gap-1 px-2 py-3">
              {menuItems.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-950"
                  >
                    <Icon className="h-4 w-4 text-slate-500" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}

export default AppMenu;
