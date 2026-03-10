import { SignIn, SignedIn, SignedOut } from "@clerk/clerk-react";
import { Navigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { clerkEnabled } from "../lib/env";

export const LoginPage = () => {
  if (!clerkEnabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f7fb] px-4">
        <div className="w-full max-w-xl rounded-[32px] border border-amber-200 bg-white p-10 text-center shadow-soft">
          <h1 className="font-display text-4xl font-semibold text-slate-950">Clerk Login</h1>
          <p className="mt-4 text-base leading-7 text-slate-600">
            Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> in <code>frontend/.env</code> and restart
            the frontend dev server to render the Clerk sign-in form.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <SignedIn>
        <Navigate to="/dashboard" replace />
      </SignedIn>
      <SignedOut>
        <div className="flex min-h-screen items-center justify-center bg-[#f4f7fb] px-4">
          <div className="w-full max-w-5xl">
            <div className="mb-4 mt-8 sm:mt-10">
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <span aria-hidden="true">{"<"}</span>
                Home
              </Link>
            </div>

            <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-soft lg:grid lg:grid-cols-[0.9fr_1.1fr]">
            <div className="hidden bg-slate-950 p-10 text-white lg:block">
              <div className="inline-flex rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">
                Login
              </div>
              <h1 className="mt-6 font-display text-5xl font-semibold tracking-tight">
                Back to your WhatsApp business desk
              </h1>
              <p className="mt-4 max-w-md text-base leading-7 text-slate-300">
                Check balances, invoices, records, and WhatsApp activation without learning a new
                workflow.
              </p>
            </div>

            <div className="flex items-center justify-center bg-[#f8fbff] p-6 sm:p-10">
              <SignIn
                routing="path"
                path="/login"
                signUpUrl="/register"
                forceRedirectUrl="/dashboard"
                appearance={{
                  elements: {
                    rootBox: "w-full",
                    card: "w-full rounded-[28px] border border-slate-200 shadow-none",
                    headerTitle: "font-display text-3xl font-semibold text-slate-950",
                    headerSubtitle: "text-slate-500",
                    socialButtonsBlockButton:
                      "rounded-2xl border-slate-200 shadow-none hover:bg-slate-50",
                    formButtonPrimary:
                      "rounded-full bg-blue-600 text-sm font-semibold hover:bg-blue-700",
                    footerActionLink: "text-blue-600 hover:text-blue-700"
                  }
                }}
              />
            </div>
          </div>
        </div>
        </div>
      </SignedOut>
    </>
  );
};
