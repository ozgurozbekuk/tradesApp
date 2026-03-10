import { footerLinks } from "./content";

export const Footer = () => {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div className="max-w-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-sm font-bold text-white">
              TA
            </div>
            <div>
              <div className="font-display text-base font-semibold text-slate-950">Trades Assistant</div>
              <div className="text-sm text-slate-500">Business admin on WhatsApp</div>
            </div>
          </div>
          <p className="mt-5 text-sm leading-7 text-slate-600">
            Built for tradespeople who want a simpler way to manage customers, jobs, and money
            without adding office software to the day.
          </p>
        </div>

        {Object.entries(footerLinks).map(([title, items]) => (
          <div key={title}>
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</h3>
            <div className="mt-4 space-y-3">
              {items.map((item) => (
                <a key={item} href="#" className="block text-sm text-slate-600 transition hover:text-slate-950">
                  {item}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-200">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-slate-500 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <span>2026 Trades Assistant. All rights reserved.</span>
          <span>Proudly built for hardworking small businesses.</span>
        </div>
      </div>
    </footer>
  );
};
