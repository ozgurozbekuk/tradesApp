// Renders a section of the landing page experience.
import { howItWorksSteps } from "./content";
import { SectionHeading } from "./SectionHeading";

export const HowItWorksSection = () => {
  return (
    <section id="how-it-works" className="bg-white py-24">
      <div className="mx-auto flex max-w-7xl flex-col gap-14 px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Process"
          title="Three simple steps to automate your business"
          description="Built for tradespeople who want faster admin, not another system to learn."
        />

        <div className="grid gap-6 md:grid-cols-3">
          {howItWorksSteps.map((step, index) => (
            <article
              key={step.title}
              className="rounded-[28px] border border-slate-200 bg-slate-50 p-8 shadow-[0_12px_30px_rgba(15,23,42,0.05)]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600/10 text-lg font-semibold text-blue-700">
                0{index + 1}
              </div>
              <h3 className="mt-6 font-display text-2xl font-semibold text-slate-950">{step.title}</h3>
              <p className="mt-3 text-base leading-7 text-slate-600">{step.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
