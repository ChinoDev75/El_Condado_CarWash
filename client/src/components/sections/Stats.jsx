
export default function Stats() {
  return (
    <section
      style={{
        background:
          "linear-gradient(135deg, rgba(212,175,55,0.05), transparent)",
        borderTop: "1px solid rgba(212,175,55,0.1)",
        borderBottom: "1px solid rgba(212,175,55,0.1)",
        position: "relative",
      }}
    >
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "6rem 1.5rem" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
            gap: "3rem",
            textAlign: "center",
          }}
        >
          {[
            ["1,500+", "Lavados Premium"],
            ["3", "Planes de Membresía"],
            ["100%", "Satisfacción"],
            ["4.9", "Estrellas Reales"],
          ].map(([n, l]) => (
            <div key={l} style={{ position: "relative" }}>
              <p
                style={{
                  fontFamily: "'Cormorant Garamond',serif",
                  fontSize: "3.5rem",
                  fontWeight: 700,
                  background: "linear-gradient(135deg, #fceabb 0%, #fccd4d 50%, #f8b500 51%, #fbdf93 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  margin: "0 0 10px",
                  lineHeight: 1
                }}
              >
                {n}
              </p>
              <p style={{ color: "#a0aec0", fontSize: "0.95rem", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>{l}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
