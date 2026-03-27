// Renders a section of the landing page experience.
type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
  align?: "left" | "center";
};

export const SectionHeading = ({
  eyebrow,
  title,
  description,
  align = "center"
}: SectionHeadingProps) => {
  const alignment = align === "center" ? "text-center items-center" : "text-left items-start";

  return (
    <div className={`flex max-w-2xl flex-col gap-3 ${alignment}`}>
      <span className="inline-flex rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-700">
        {eyebrow}
      </span>
      <h2 className="font-display text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="max-w-xl text-base leading-7 text-slate-600">{description}</p>
      ) : null}
    </div>
  );
};
