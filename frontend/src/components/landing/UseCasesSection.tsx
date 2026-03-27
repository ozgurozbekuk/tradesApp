// Renders a section of the landing page experience.
import { useCaseCommands } from "./content";
import { SectionHeading } from "./SectionHeading";

export const UseCasesSection = () => {
  return (
    <section id="use-cases" className="bg-slate-950 py-24 text-white">
      <div className="mx-auto grid max-w-7xl gap-14 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div className="flex flex-col gap-8">
          <SectionHeading
            eyebrow="Real-world use"
            title="Made for plumbers, electricians, cleaners, and builders"
            description="If your day moves through calls, site visits, and WhatsApp messages, this fits the way you already work."
            align="left"
          />

          <div className="grid gap-3">
            {[
              "Plumbers: track call-outs and unpaid boiler jobs",
              "Electricians: log jobs and payments between visits",
              "Cleaners: keep recurring client records simple",
              "Builders: monitor quotes, balances, and supplier debt"
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-6">
            <div className="text-sm font-semibold text-slate-200">Example commands</div>
            <div className="mt-4 flex flex-wrap gap-3">
              {useCaseCommands.map((command) => (
                <div
                  key={command}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200"
                >
                  {command}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-[#101b38] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
            <div className="rounded-2xl bg-white/5 px-4 py-3 text-sm text-slate-200">
              <div className="font-semibold text-white">Assistant preview</div>
            </div>
            <div className="mt-4 space-y-3">
              <div className="max-w-[80%] rounded-2xl bg-white/8 px-4 py-3 text-sm text-slate-200">
                Show unpaid customers
              </div>
              <div className="ml-auto max-w-[88%] rounded-2xl bg-blue-600 px-4 py-3 text-sm text-white">
                3 customers still owe money today: John Plumbing GBP 320, Ahmad Repairs GBP 180,
                Sarah Homes GBP 640.
              </div>
              <div className="max-w-[80%] rounded-2xl bg-white/8 px-4 py-3 text-sm text-slate-200">
                What did I earn this week?
              </div>
              <div className="ml-auto max-w-[88%] rounded-2xl bg-emerald-500/90 px-4 py-3 text-sm text-slate-950">
                This week: income GBP 1,480, expenses GBP 380, net GBP 1,100.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
