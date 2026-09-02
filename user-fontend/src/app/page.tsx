import { BrandStrip } from "@/components/BrandStrip";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { HeroSection } from "@/components/HeroSection";
import { InspirationSection } from "@/components/InspirationSection";
import { NeedsSection } from "@/components/NeedsSection";
import { ProductSection } from "@/components/ProductSection";
import { ProcessSection } from "@/components/ProcessSection";
import { StoreSection } from "@/components/StoreSection";
import { TestimonialsSection } from "@/components/TestimonialsSection";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f3ee] text-[#151312]">
      <Header />
      <HeroSection />
      <BrandStrip />
      <ProductSection />
      <NeedsSection />
      <ProcessSection />
      <StoreSection />
      <TestimonialsSection />
      <InspirationSection />
      <Footer />
    </main>
  );
}
