import { featureCards } from "./content";
import { SectionHeading } from "./SectionHeading";

export const FeaturesSection = () => {
  return (
    <section id="features" className="bg-slate-50 py-24">
      <div className="mx-auto flex max-w-7xl flex-col gap-14 px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Features"
          title="Everything you need to run your trade business"
          description="The product feels like a reliable office helper, not complicated accounting software."
        />

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {featureCards.map((feature) => (
            <article
              key={feature.title}
              className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_12px_30px_rgba(15,23,42,0.04)] transition hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(15,23,42,0.08)]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-700">
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                  <path d="M4 5.75A2.75 2.75 0 0 1 6.75 3h10.5A2.75 2.75 0 0 1 20 5.75v12.5A2.75 2.75 0 0 1 17.25 21H6.75A2.75 2.75 0 0 1 4 18.25Zm2.75-1.25c-.69 0-1.25.56-1.25 1.25v12.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25V5.75c0-.69-.56-1.25-1.25-1.25ZM8 8.25c0-.41.34-.75.75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 8 8.25Zm0 4c0-.41.34-.75.75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1-.75-.75Zm0 4c0-.41.34-.75.75-.75h3.5a.75.75 0 0 1 0 1.5h-3.5a.75.75 0 0 1-.75-.75Z" />
                </svg>
              </div>
              <h3 className="mt-6 font-display text-2xl font-semibold text-slate-950">{feature.title}</h3>
              <p className="mt-3 text-base leading-7 text-slate-600">{feature.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
