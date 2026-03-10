import { CTASection } from "../components/landing/CTASection";
import { FeaturesSection } from "../components/landing/FeaturesSection";
import { Footer } from "../components/landing/Footer";
import { HeroSection } from "../components/landing/HeroSection";
import { HowItWorksSection } from "../components/landing/HowItWorksSection";
import { Navbar } from "../components/landing/Navbar";
import { PricingSection } from "../components/landing/PricingSection";
import { UseCasesSection } from "../components/landing/UseCasesSection";

export const LandingPage = () => {
  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <Navbar />
      <main>
        <HeroSection />
        <HowItWorksSection />
        <FeaturesSection />
        <UseCasesSection />
        <PricingSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
};
