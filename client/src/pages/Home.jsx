import { useState } from "react";
import AuthModal from "../components/modals/AuthModal";
import TermsModal from "../components/modals/TermsModal";
import Navbar from "../components/layout/Navbar";
import Hero from "../components/sections/Hero";
import Services from "../components/sections/Services";
import Promotions from "../components/sections/Promotions";
import Memberships from "../components/sections/Memberships";
import Extras from "../components/sections/Extras";
import ReviewsSection from "../components/sections/ReviewsSection";
import Footer from "../components/layout/Footer";

export default function Home() {
  const [authOpen, setAuthOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) {
      const offset = 80; // Compensar el navbar fijo
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = el.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });
    }
  };

  const sectionTitle = (text, sub) => (
    <div style={{ textAlign: "center", marginBottom: "4rem" }}>
      <p style={{ 
        color: "#D4AF37", 
        fontSize: "0.75rem", 
        fontWeight: 800, 
        letterSpacing: "0.3em", 
        textTransform: "uppercase",
        marginBottom: "1rem"
      }}>
        ✦ Explorar ✦
      </p>
      <h2
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: "clamp(2.5rem, 5vw, 3.5rem)",
          fontWeight: 700,
          color: "#fff",
          margin: "0 0 1rem",
          letterSpacing: "-0.01em",
        }}
      >
        {text}
      </h2>
      {sub && (
        <p
          style={{
            color: "#718096",
            maxWidth: "520px",
            margin: "0 auto",
            lineHeight: 1.8,
            fontSize: "1.05rem"
          }}
        >
          {sub}
        </p>
      )}
      <div
        style={{
          width: "80px",
          height: "3px",
          background: "linear-gradient(90deg, transparent, #D4AF37, transparent)",
          margin: "1.5rem auto 0",
          borderRadius: "4px",
        }}
      />
    </div>
  );

  return (
    <>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />

      <Navbar onAuthOpen={() => setAuthOpen(true)} scrollTo={scrollTo} />
      
      <main>
        <Hero scrollTo={scrollTo} />
        <Services sectionTitle={sectionTitle} onAuthOpen={() => setAuthOpen(true)} />
        <Promotions sectionTitle={sectionTitle} onAuthOpen={() => setAuthOpen(true)} />
        <Memberships sectionTitle={sectionTitle} onAuthOpen={() => setAuthOpen(true)} />
        <Extras sectionTitle={sectionTitle} onAuthOpen={() => setAuthOpen(true)} />
        <ReviewsSection sectionTitle={sectionTitle} />
      </main>

      <Footer onAuthOpen={() => setAuthOpen(true)} onTermsOpen={() => setTermsOpen(true)} />
    </>
  );
}
