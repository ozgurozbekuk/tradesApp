// Renders a section of the landing page experience.
export const CTASection = () => {
  return (
    <section className="bg-[#eef3fb] py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-[36px] border border-white/60 bg-white px-8 py-14 text-center shadow-[0_28px_60px_rgba(15,23,42,0.08)] sm:px-12">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Ready to stop worrying about admin?
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              Let WhatsApp become the place where your jobs, customers, payments, and simple
              business records stay under control.
            </p>
          </div>

          <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
            <button className="inline-flex items-center justify-center rounded-full bg-blue-600 px-7 py-3 text-base font-semibold text-white shadow-[0_16px_28px_rgba(37,99,235,0.25)] transition hover:bg-blue-700">
              Get Started for Free
            </button>
            <button className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-slate-50 px-7 py-3 text-base font-semibold text-slate-800 transition hover:bg-slate-100">
              Book a Demo
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
