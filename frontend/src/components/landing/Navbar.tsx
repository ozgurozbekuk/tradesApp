import { SignedIn, SignedOut, UserButton } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { clerkEnabled } from "../../lib/env";

const navItems = [
  { label: "Features", to: "/#features" },
  { label: "How it works", to: "/#how-it-works" },
  { label: "Pricing", to: "/#pricing" },
  { label: "Use cases", to: "/#use-cases" }
];

export const Navbar = () => {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-600 text-sm font-bold text-white shadow-[0_12px_24px_rgba(37,99,235,0.35)]">
            TA
          </div>
          <div>
            <div className="font-display text-sm font-semibold text-slate-950">Trades Assistant</div>
            <div className="text-xs text-slate-500">WhatsApp business helper</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-slate-600 lg:flex">
          {navItems.map((item) => (
            <Link key={item.label} to={item.to} className="transition hover:text-slate-950">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {clerkEnabled ? (
            <>
              <SignedOut>
                <Link
                  to="/login"
                  className="hidden rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 sm:inline-flex"
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  className="inline-flex rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(37,99,235,0.3)] transition hover:bg-blue-700"
                >
                  Get Started
                </Link>
              </SignedOut>
              <SignedIn>
                <Link
                  to="/dashboard"
                  className="inline-flex rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(37,99,235,0.3)] transition hover:bg-blue-700"
                >
                  Dashboard
                </Link>
                <div className="hidden sm:block">
                  <UserButton afterSignOutUrl="/" />
                </div>
              </SignedIn>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="hidden rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 sm:inline-flex"
              >
                Log in
              </Link>
              <Link
                to="/register"
                className="inline-flex rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(37,99,235,0.3)] transition hover:bg-blue-700"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
