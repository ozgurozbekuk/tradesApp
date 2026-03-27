// Renders a section of the landing page experience.
import { pricingPlans } from "./content";
import { SectionHeading } from "./SectionHeading";

export const PricingSection = () => {
  return (
    <section id="pricing" className="bg-white py-24">
      <div className="mx-auto flex max-w-7xl flex-col gap-14 px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Pricing"
          title="Simple, transparent pricing"
          description="Start free, stay light, and upgrade only when the assistant becomes part of your daily workflow."
        />

        <div className="grid gap-6 lg:grid-cols-2">
          {pricingPlans.map((plan) => (
            <article
              key={plan.name}
              className={`rounded-[32px] border p-8 shadow-[0_20px_40px_rgba(15,23,42,0.06)] ${
                plan.featured
                  ? "border-slate-900 bg-slate-950 text-white"
                  : "border-slate-200 bg-slate-50 text-slate-950"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-display text-2xl font-semibold">{plan.name}</h3>
                  <p className={`mt-3 max-w-md text-sm leading-7 ${plan.featured ? "text-slate-300" : "text-slate-600"}`}>
                    {plan.description}
                  </p>
                </div>
                {plan.featured ? (
                  <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                    Most popular
                  </span>
                ) : null}
              </div>

              <div className="mt-8 flex items-end gap-2">
                <span className="font-display text-5xl font-semibold">
                  {plan.price === "Free" ? plan.price : `GBP ${plan.price}`}
                </span>
                <span className={plan.featured ? "pb-2 text-slate-400" : "pb-2 text-slate-500"}>/month</span>
              </div>

              <div className="mt-8 space-y-4">
                {plan.features.map((feature) => (
                  <div
                    key={feature}
                    className={`flex items-center gap-3 text-sm ${
                      plan.featured ? "text-slate-200" : "text-slate-700"
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${plan.featured ? "bg-emerald-400" : "bg-blue-600"}`} />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <button
                className={`mt-10 inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${
                  plan.featured
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "border border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                }`}
              >
                {plan.cta}
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
