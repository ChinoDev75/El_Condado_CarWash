import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconCar, IconClose, IconMenu, IconWA } from "../Icons";
import { ghostBtn, waBtn, goldBtn } from "../../styles/buttonStyles";
import { WHATSAPP_URL } from "../../constants/whatsapp";
import { useAuth } from "../../context/useAuth";

const navItems = [
  ["servicios", "Servicios"],
  ["promociones", "Promos"],
  ["membresias", "Membresias"],
  ["plugins", "Extras"],
];

export default function Navbar({ onAuthOpen, scrollTo }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const handleAccountClick = () => {
    if (!user) {
      onAuthOpen();
      return;
    }

    navigate(user.role === "admin" ? "/admin" : "/dashboard");
  };

  const handleNavClick = (id) => {
    setMenuOpen(false);

    if (scrollTo) {
      scrollTo(id);
      return;
    }

    navigate(`/#${id}`);
  };

  const handleMobileAccountClick = () => {
    setMenuOpen(false);
    handleAccountClick();
  };

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
  };

  const goHome = () => {
    setMenuOpen(false);
    navigate("/");
  };

  return (
    <nav
      className="site-navbar"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: "rgba(5, 7, 10, 0.8)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
      }}
    >
      <div
        className="navbar-inner"
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "0 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "72px",
        }}
      >
        <button
          type="button"
          className="navbar-brand"
          onClick={goHome}
          aria-label="Ir al inicio"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            cursor: "pointer",
            background: "none",
            border: "none",
            padding: 0,
          }}
        >
          <div
            style={{
              background: "linear-gradient(135deg,#D4AF37,#F5D06B)",
              borderRadius: "10px",
              padding: "8px",
              color: "#0a0d14",
              boxShadow: "0 4px 12px rgba(212,175,55,0.2)",
            }}
          >
            <IconCar />
          </div>
          <div style={{ textAlign: "left" }}>
            <span
              style={{
                fontFamily: "'Cormorant Garamond',serif",
                fontSize: "1.25rem",
                fontWeight: 700,
                color: "#fff",
                display: "block",
                lineHeight: 1.1,
              }}
            >
              El Condado
            </span>
            <span
              style={{
                color: "#D4AF37",
                fontSize: "0.65rem",
                display: "block",
                lineHeight: 1,
                marginTop: "2px",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                fontWeight: 800,
              }}
            >
              CarWash
            </span>
          </div>
        </button>

        <div
          className="desktop-nav"
          style={{ display: "flex", gap: "2.5rem", alignItems: "center" }}
        >
          {navItems.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => handleNavClick(id)}
              style={{
                background: "none",
                border: "none",
                color: "#a0aec0",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontFamily: "inherit",
                fontWeight: 500,
                letterSpacing: "0.02em",
                transition: "color 0.3s ease",
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.color = "#D4AF37";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.color = "#a0aec0";
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="navbar-actions" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {user && (
            <button
              type="button"
              onClick={handleLogout}
              style={{
                ...ghostBtn,
                padding: "10px 20px",
                fontSize: "0.8rem",
                borderRadius: "12px",
                borderColor: "rgba(248, 113, 113, 0.2)",
                color: "#f87171",
              }}
            >
              Salir
            </button>
          )}
          <button
            type="button"
            onClick={handleAccountClick}
            style={{
              ...goldBtn,
              padding: "10px 20px",
              fontSize: "0.8rem",
              borderRadius: "12px",
            }}
          >
            {user ? "Mi Panel" : "Mi cuenta"}
          </button>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
            style={{
              ...waBtn,
              padding: "10px 16px",
              textDecoration: "none",
              fontSize: "0.8rem",
              borderRadius: "12px",
              boxShadow: "0 4px 12px rgba(37, 211, 102, 0.2)",
            }}
          >
            <IconWA />
          </a>
        </div>

        <button
          type="button"
          className="mobile-menu-button"
          onClick={() => setMenuOpen((current) => !current)}
          aria-label={menuOpen ? "Cerrar menu" : "Abrir menu"}
          aria-controls="mobile-navigation"
          aria-expanded={menuOpen}
        >
          {menuOpen ? <IconClose /> : <IconMenu />}
        </button>
      </div>

      <div
        className={`mobile-nav-overlay ${menuOpen ? "is-open" : ""}`}
        aria-hidden={!menuOpen}
        onClick={() => setMenuOpen(false)}
      />

      <div
        id="mobile-navigation"
        className={`mobile-nav-panel ${menuOpen ? "is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu principal"
      >
        <div className="mobile-nav-head">
          <div>
            <p>El Condado</p>
            <span>{user ? user.name : "Menu principal"}</span>
          </div>
          <button type="button" onClick={() => setMenuOpen(false)} aria-label="Cerrar menu">
            <IconClose />
          </button>
        </div>

        <div className="mobile-nav-links">
          {navItems.map(([id, label]) => (
            <button key={id} type="button" onClick={() => handleNavClick(id)}>
              {label}
            </button>
          ))}
        </div>

        <div className="mobile-nav-actions">
          <button type="button" onClick={handleMobileAccountClick} style={goldBtn}>
            {user ? "Mi Panel" : "Mi cuenta"}
          </button>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
            onClick={() => setMenuOpen(false)}
            style={{ ...waBtn, textDecoration: "none" }}
          >
            <IconWA /> WhatsApp
          </a>
          {user && (
            <button
              type="button"
              onClick={handleLogout}
              style={{ ...ghostBtn, color: "#f87171", borderColor: "rgba(248, 113, 113, 0.25)" }}
            >
              Salir
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
