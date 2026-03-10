import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { clerkEnabled } from "../../lib/env";

const previewMessages = [
  {
    sender: "customer",
    text: "Can you fit me in for boiler repair tomorrow?"
  },
  {
    sender: "assistant",
    text: "Booked. I added the job, saved the customer, and set a reminder for tomorrow morning."
  },
  {
    sender: "customer",
    text: "John paid 120 cash."
  },
  {
    sender: "assistant",
    text: "Recorded. John's balance is now 330 and today's income has been updated."
  }
];

export const HeroSection = () => {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.18),_transparent_38%),radial-gradient(circle_at_top_right,_rgba(14,165,164,0.14),_transparent_34%)]" />
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">
            <span className="h-2 w-2 rounded-full bg-blue-600" />
            Now in private beta
          </div>

          <h1 className="mt-8 font-display text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">
            Your business
            <span className="block text-blue-600">assistant on WhatsApp</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
            A calm, practical AI assistant for tradespeople. Keep customers, jobs, payments, debts,
            and daily admin moving without opening heavy software.
          </p>

          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            {clerkEnabled ? (
              <>
                <SignedOut>
                  <Link
                    to="/register"
                    className="inline-flex items-center justify-center rounded-full bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-[0_16px_32px_rgba(37,99,235,0.28)] transition hover:bg-blue-700"
                  >
                    Get Started
                  </Link>
                </SignedOut>
                <SignedIn>
                  <Link
                    to="/dashboard"
                    className="inline-flex items-center justify-center rounded-full bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-[0_16px_32px_rgba(37,99,235,0.28)] transition hover:bg-blue-700"
                  >
                    Dashboard
                  </Link>
                </SignedIn>
              </>
            ) : (
              <Link
                to="/register"
                className="inline-flex items-center justify-center rounded-full bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-[0_16px_32px_rgba(37,99,235,0.28)] transition hover:bg-blue-700"
              >
                Get Started
              </Link>
            )}
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              See how it works
            </a>
          </div>

          <div className="mt-10 flex items-center gap-6 text-sm text-slate-500">
            <div className="flex -space-x-2">
              <span className="h-8 w-8 rounded-full border-2 border-white bg-slate-200" />
              <span className="h-8 w-8 rounded-full border-2 border-white bg-slate-300" />
              <span className="h-8 w-8 rounded-full border-2 border-white bg-slate-400" />
            </div>
            <p>Joined by 500+ tradespeople who wanted less admin.</p>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -right-8 top-8 h-32 w-32 rounded-full bg-emerald-200/40 blur-3xl" />
          <div className="absolute -left-8 bottom-10 h-40 w-40 rounded-full bg-blue-200/50 blur-3xl" />
          <div className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-slate-950 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
              <div>
                <div className="font-semibold text-white">John Doe Plumbing</div>
                <div className="text-xs text-slate-400">WhatsApp assistant live</div>
              </div>
              <div className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-300">
                Connected
              </div>
            </div>

            <div className="mt-4 space-y-3 rounded-[24px] bg-slate-900/80 p-4">
              {previewMessages.map((message) => (
                <div
                  key={message.text}
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                    message.sender === "assistant"
                      ? "ml-auto bg-blue-600 text-white"
                      : "bg-white/8 text-slate-200"
                  }`}
                >
                  {message.text}
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 rounded-[24px] bg-white/5 p-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Today</div>
                <div className="mt-2 text-3xl font-semibold text-white">4 jobs</div>
                <div className="mt-1 text-sm text-slate-400">2 payments logged</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Outstanding</div>
                <div className="mt-2 text-3xl font-semibold text-emerald-300">GBP 1,280</div>
                <div className="mt-1 text-sm text-slate-400">3 customers unpaid</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
