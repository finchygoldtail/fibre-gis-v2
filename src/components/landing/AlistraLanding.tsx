import React, { useState } from "react";

type AlistraLandingProps = {
  loginPanel: React.ReactNode;
};

const products = [
  {
    name: "Alistra GIS",
    kicker: "Spatial operations",
    copy: "GIS control for network assets, exchanges, routes, chambers, poles, and live infrastructure records.",
  },
  {
    name: "Alistra Atlas",
    kicker: "Digital twin",
    copy: "A connected infrastructure atlas for planning, topology, portfolio visibility, and asset relationships.",
  },
  {
    name: "Alistra Field",
    kicker: "Mobile delivery",
    copy: "Field-ready workflows for surveys, build evidence, photos, maintenance, and on-site updates.",
  },
  {
    name: "Alistra Insight",
    kicker: "Reporting",
    copy: "Analytics for delivery progress, risk, quality, commercial decisions, and operational performance.",
  },
  {
    name: "Alistra Docs",
    kicker: "Documentation",
    copy: "Structured job packs, registers, exports, audit evidence, and client-ready delivery documents.",
  },
];

const infrastructureItems = [
  {
    name: "Fibre",
    icon: "F",
    copy: "Routes, joints, trays, exchanges, distribution points, drops, and fibre continuity.",
  },
  {
    name: "Gas",
    icon: "G",
    copy: "Utility awareness for gas corridors, risk context, and shared street works planning.",
  },
  {
    name: "Water",
    icon: "W",
    copy: "Spatial utility references for water corridors, access constraints, and reinstatement context.",
  },
  {
    name: "Poles",
    icon: "P",
    copy: "Pole locations, attachments, survey evidence, maintenance state, and field decisions.",
  },
  {
    name: "Chambers",
    icon: "C",
    copy: "Chamber records, access points, ducts, photos, audit history, and network relationships.",
  },
  {
    name: "Reporting",
    icon: "R",
    copy: "Operational dashboards, job packs, audit trails, exports, and client-ready evidence.",
  },
];

const platformAreas = [
  {
    name: "Telecoms",
    status: "Live",
    copy: "Fibre routes, ducts, poles, chambers, exchanges, DPs, homes, job packs, and QGIS exports.",
  },
  {
    name: "Gas",
    status: "Coming soon",
    copy: "Utility corridor awareness, street works context, constraints, and asset relationship mapping.",
  },
  {
    name: "Water",
    status: "Coming soon",
    copy: "Water network context for planning, reinstatement, access risks, and spatial coordination.",
  },
  {
    name: "Power",
    status: "Coming soon",
    copy: "Electrical infrastructure mapping for planned works, field evidence, and operational reporting.",
  },
  {
    name: "Maps",
    status: "Coming soon",
    copy: "Cross-utility map views, overlays, exports, and client-ready digital infrastructure records.",
  },
];

export default function AlistraLanding({ loginPanel }: AlistraLandingProps) {
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <div style={screen}>
      <style>
        {`
          html {
            scroll-behavior: smooth;
          }

          @keyframes alistraFiberFlow {
            0% { transform: translateX(-18%) rotate(-10deg); opacity: 0.35; }
            50% { opacity: 0.95; }
            100% { transform: translateX(18%) rotate(-10deg); opacity: 0.35; }
          }

          @keyframes alistraPageFiberFlow {
            0% { transform: translateX(-16%) rotate(-8deg); opacity: 0.2; }
            50% { opacity: 0.65; }
            100% { transform: translateX(16%) rotate(-8deg); opacity: 0.2; }
          }

          @keyframes alistraPulse {
            0%, 100% { box-shadow: 0 0 0 rgba(56,189,248,0); }
            50% { box-shadow: 0 0 24px rgba(56,189,248,0.45); }
          }

          .alistra-fibre-line {
            animation: alistraFiberFlow 5.8s ease-in-out infinite;
          }

          .alistra-page-fibre-line {
            animation: alistraPageFiberFlow 8s ease-in-out infinite;
          }

          .alistra-fibre-node {
            animation: alistraPulse 3.2s ease-in-out infinite;
          }

          .alistra-section-anchor {
            scroll-margin-top: 92px;
          }

          @media (max-width: 920px) {
            .alistra-nav-links {
              display: none !important;
            }

            .alistra-hero {
              grid-template-columns: 1fr !important;
            }

            .alistra-contact {
              grid-template-columns: 1fr !important;
            }
          }

          @media (max-width: 620px) {
            .alistra-header {
              align-items: flex-start !important;
              flex-direction: column !important;
            }

            .alistra-brand-row {
              width: 100% !important;
              justify-content: space-between !important;
            }

            .alistra-hero-visual {
              min-height: 280px !important;
            }
          }
        `}
      </style>

      <div style={pageAnimation} aria-hidden="true">
        <span style={{ ...pageFiberLine, top: "15%" }} className="alistra-page-fibre-line" />
        <span style={{ ...pageFiberLine, top: "34%", animationDelay: "1.8s" }} className="alistra-page-fibre-line" />
        <span style={{ ...pageFiberLine, top: "57%", animationDelay: "3.1s" }} className="alistra-page-fibre-line" />
        <span style={{ ...pageFiberLine, top: "78%", animationDelay: "4.4s" }} className="alistra-page-fibre-line" />
        <span style={{ ...pageNode, left: "12%", top: "24%" }} className="alistra-fibre-node" />
        <span style={{ ...pageNode, left: "81%", top: "41%", animationDelay: "1.2s" }} className="alistra-fibre-node" />
        <span style={{ ...pageNode, left: "47%", top: "69%", animationDelay: "2.4s" }} className="alistra-fibre-node" />
      </div>

      <header style={siteHeader} className="alistra-header">
        <div style={brandRow} className="alistra-brand-row">
          <a href="#top" style={brandLink}>
            <img
              src="/Alistra GIS Logo.png"
              alt="Alistra GIS"
              style={navLogo}
            />
            <span>Alistra GIS</span>
          </a>
        </div>

        <nav
          style={navLinks}
          className="alistra-nav-links"
          aria-label="Public website navigation"
        >
          <a href="#top" style={navLink}>Home</a>
          <a href="#about" style={navLink}>About</a>
          <a href="#explore" style={navLink}>Explore</a>
          <a href="#products" style={navLink}>Products</a>
          <a href="#infrastructure" style={navLink}>Infrastructure</a>
          <a href="#contact" style={navLink}>Contact</a>
        </nav>

        <button
          type="button"
          style={loginAnchor}
          onClick={() => setLoginOpen(true)}
        >
          Login
        </button>
      </header>

      {loginOpen ? (
        <div style={loginOverlay} role="dialog" aria-modal="true">
          <button
            type="button"
            style={overlayClose}
            onClick={() => setLoginOpen(false)}
          >
            Close
          </button>
          <div style={overlayPanel}>
            {loginPanel}
          </div>
        </div>
      ) : null}

      <a href="#top" style={backToTop}>
        Back to top
      </a>

      <main style={pageShell} id="top">
        <section style={heroSection} className="alistra-hero">
          <div style={heroContent}>
            <p style={eyebrow}>Alistra GIS</p>
            <h1 style={headline}>
              The operating system for infrastructure intelligence
            </h1>

            <p style={brandMeaning}>
              Asset Location Intelligence, Spatial Tracking, Reporting &amp;
              Analytics
            </p>

            <p style={visionText}>
              A spatial command layer for fibre, gas, water, chambers, poles,
              ducts, routes, delivery evidence, and live infrastructure records.
            </p>

            <div style={domainRow}>
              <span>alistragis.com</span>
              <span>alistragis.uk</span>
              <span>alistra.co.uk</span>
            </div>

            <div style={heroActions}>
              <a href="#explore" style={primaryCta}>
                Explore platform
              </a>
              <a href="#contact" style={secondaryCta}>
                Contact Alistra
              </a>
            </div>
          </div>

          <div style={heroColumn}>
            <div style={heroVisual} className="alistra-hero-visual">
              <div style={heroImage} />
              <div style={fiberOverlay} aria-hidden="true">
                <span
                  style={{ ...fiberLine, top: "24%" }}
                  className="alistra-fibre-line"
                />
                <span
                  style={{ ...fiberLine, top: "46%", animationDelay: "1.2s" }}
                  className="alistra-fibre-line"
                />
                <span
                  style={{ ...fiberLine, top: "68%", animationDelay: "2.1s" }}
                  className="alistra-fibre-line"
                />
                <span
                  style={{ ...fiberNode, left: "22%", top: "42%" }}
                  className="alistra-fibre-node"
                />
                <span
                  style={{ ...fiberNode, left: "58%", top: "28%", animationDelay: "0.8s" }}
                  className="alistra-fibre-node"
                />
                <span
                  style={{ ...fiberNode, left: "76%", top: "66%", animationDelay: "1.6s" }}
                  className="alistra-fibre-node"
                />
              </div>
            </div>
          </div>
        </section>

        <section style={section} id="about" className="alistra-section-anchor">
          <div style={sectionIntro}>
            <p style={eyebrow}>Product vision</p>
            <h2 style={sectionTitle}>
              Built for the teams who plan, build, maintain, and prove networks.
            </h2>
          </div>

          <div style={aboutGrid}>
            <p style={bodyCopy}>
              Alistra GIS turns infrastructure records into a live operational
              view: where assets are, how they connect, what has changed, and
              what evidence supports the work.
            </p>
            <p style={bodyCopy}>
              The platform is shaped around field reality: poles, chambers,
              ducts, fibre routes, utility corridors, job packs, audits,
              maintenance history, and delivery reporting.
            </p>
          </div>
        </section>

        <section style={section} id="explore" className="alistra-section-anchor">
          <div style={sectionIntro}>
            <p style={eyebrow}>Explore platform</p>
            <h2 style={sectionTitle}>
              Telecoms live now. Gas, water, power, and maps coming soon.
            </h2>
          </div>

          <div style={platformGrid}>
            {platformAreas.map((area) => (
              <article key={area.name} style={area.status === "Live" ? platformCardLive : platformCard}>
                <div style={platformHead}>
                  <h3 style={platformTitle}>{area.name}</h3>
                  <span style={area.status === "Live" ? livePill : soonPill}>
                    {area.status}
                  </span>
                </div>
                <p style={platformCopy}>{area.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section style={section} id="products" className="alistra-section-anchor">
          <div style={sectionIntro}>
            <p style={eyebrow}>Platform suite</p>
            <h2 style={sectionTitle}>
              One brand, connected products.
            </h2>
          </div>

          <div style={productGrid}>
            {products.map((product) => (
              <article key={product.name} style={productCard}>
                <p style={productKicker}>{product.kicker}</p>
                <h3 style={productTitle}>{product.name}</h3>
                <p style={productCopy}>{product.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section style={section} id="infrastructure" className="alistra-section-anchor">
          <div style={sectionIntro}>
            <p style={eyebrow}>Infrastructure intelligence</p>
            <h2 style={sectionTitle}>
              Fibre, utilities, and field assets in one spatial record.
            </h2>
          </div>

          <div style={assetGrid}>
            {infrastructureItems.map((item) => (
              <article key={item.name} style={assetTile}>
                <span style={assetIcon}>{item.icon}</span>
                <div>
                  <h3 style={assetTitle}>{item.name}</h3>
                  <p style={assetCopy}>{item.copy}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section
          style={contactSection}
          className="alistra-contact alistra-section-anchor"
          id="contact"
        >
          <div>
            <p style={eyebrow}>Contact</p>
            <h2 style={sectionTitle}>
              Talk to Alistra about infrastructure intelligence.
            </h2>
            <p style={bodyCopy}>
              Public website enquiries, product demos, and client access can be
              directed through contact@alistragis.com or the Alistra domains.
            </p>
          </div>

          <div style={contactPanel}>
            <a style={contactLink} href="mailto:contact@alistragis.com">
              contact@alistragis.com
            </a>
            <a style={contactLink} href="https://alistragis.com">
              alistragis.com
            </a>
            <a style={contactLink} href="https://alistragis.uk">
              alistragis.uk
            </a>
            <a style={contactLink} href="https://alistra.co.uk">
              alistra.co.uk
            </a>
          </div>
        </section>
      </main>

      <footer style={siteFooter}>
        <div>Alistra GIS v1.0.0</div>
        <div>(c) 2026 Alistra GIS. All Rights Reserved.</div>
        <div>Confidential &amp; Proprietary Software</div>
      </footer>
    </div>
  );
}

const screen: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at 8% 8%, rgba(14,165,233,0.22), transparent 32%), linear-gradient(180deg, #020617 0%, #07111f 48%, #0f172a 100%)",
  color: "white",
  overflowX: "hidden",
  position: "relative",
};

const siteHeader: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 20,
  padding: "14px clamp(18px, 5vw, 64px)",
  background: "rgba(2,6,23,0.84)",
  backdropFilter: "blur(16px)",
  borderBottom: "1px solid rgba(148,163,184,0.16)",
};

const pageAnimation: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 0,
  pointerEvents: "none",
  overflow: "hidden",
  opacity: 0.72,
};

const pageFiberLine: React.CSSProperties = {
  position: "absolute",
  left: "-18%",
  width: "136%",
  height: 2,
  background:
    "linear-gradient(90deg, transparent, rgba(14,165,233,0.06), rgba(56,189,248,0.42), rgba(250,204,21,0.24), transparent)",
  borderRadius: 999,
};

const pageNode: React.CSSProperties = {
  position: "absolute",
  width: 9,
  height: 9,
  borderRadius: 999,
  background: "#38bdf8",
  border: "1px solid rgba(224,242,254,0.76)",
};

const brandRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
};

const brandLink: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  color: "#ffffff",
  textDecoration: "none",
  fontWeight: 800,
  letterSpacing: 0,
};

const navLogo: React.CSSProperties = {
  width: 36,
  height: 36,
  objectFit: "contain",
};

const navLinks: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: 8,
};

const navLink: React.CSSProperties = {
  color: "#cbd5e1",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 700,
  padding: "9px 10px",
};

const loginAnchor: React.CSSProperties = {
  color: "#020617",
  background: "#e0f2fe",
  fontSize: 14,
  fontWeight: 900,
  padding: "10px 16px",
  borderRadius: 8,
  whiteSpace: "nowrap",
  border: 0,
  cursor: "pointer",
};

const loginOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 30,
  display: "grid",
  placeItems: "center",
  padding: 22,
  background: "rgba(2,6,23,0.74)",
  backdropFilter: "blur(10px)",
};

const overlayPanel: React.CSSProperties = {
  width: "min(390px, 100%)",
};

const overlayClose: React.CSSProperties = {
  position: "fixed",
  top: 88,
  right: 24,
  border: "1px solid rgba(148,163,184,0.34)",
  borderRadius: 8,
  padding: "9px 12px",
  background: "rgba(15,23,42,0.92)",
  color: "#e0f2fe",
  fontWeight: 900,
  cursor: "pointer",
};

const backToTop: React.CSSProperties = {
  position: "fixed",
  right: 18,
  bottom: 18,
  zIndex: 6,
  color: "#020617",
  background: "#e0f2fe",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 900,
  padding: "10px 14px",
  borderRadius: 8,
  boxShadow: "0 14px 34px rgba(0,0,0,0.35)",
};

const pageShell: React.CSSProperties = {
  width: "min(1240px, calc(100% - 36px))",
  margin: "0 auto",
  paddingTop: 78,
  position: "relative",
  zIndex: 1,
};

const heroSection: React.CSSProperties = {
  minHeight: "calc(100vh - 78px)",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.05fr) minmax(340px, 0.95fr)",
  gap: 28,
  alignItems: "center",
  padding: "44px 0 28px",
};

const heroContent: React.CSSProperties = {
  minWidth: 0,
  padding: "18px 0",
};

const eyebrow: React.CSSProperties = {
  margin: "0 0 12px",
  color: "#7dd3fc",
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: 0,
  textTransform: "uppercase",
};

const headline: React.CSSProperties = {
  margin: 0,
  maxWidth: 780,
  fontSize: "clamp(42px, 6vw, 82px)",
  lineHeight: 0.98,
  letterSpacing: 0,
};

const brandMeaning: React.CSSProperties = {
  margin: "22px 0 14px",
  maxWidth: 760,
  color: "#e0f2fe",
  fontSize: 20,
  lineHeight: 1.45,
  fontWeight: 800,
};

const visionText: React.CSSProperties = {
  margin: "0 0 22px",
  maxWidth: 690,
  color: "#cbd5e1",
  fontSize: 17,
  lineHeight: 1.7,
};

const domainRow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginBottom: 28,
  color: "#bfdbfe",
  fontSize: 13,
  fontWeight: 800,
};

const heroActions: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
};

const primaryCta: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 44,
  padding: "0 18px",
  borderRadius: 8,
  color: "#020617",
  background: "#38bdf8",
  textDecoration: "none",
  fontWeight: 900,
};

const secondaryCta: React.CSSProperties = {
  ...primaryCta,
  color: "#e0f2fe",
  background: "rgba(15,23,42,0.72)",
  border: "1px solid rgba(148,163,184,0.28)",
};

const heroColumn: React.CSSProperties = {
  display: "grid",
  gap: 16,
};

const heroVisual: React.CSSProperties = {
  position: "relative",
  minHeight: 380,
  borderRadius: 8,
  overflow: "hidden",
  border: "1px solid rgba(148,163,184,0.2)",
  boxShadow: "0 28px 80px rgba(0,0,0,0.42)",
};

const heroImage: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundImage:
    "linear-gradient(90deg, rgba(2,6,23,0.16), rgba(2,6,23,0.64)), url('/alistra-infrastructure-hero.png')",
  backgroundSize: "cover",
  backgroundPosition: "center",
};

const fiberOverlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  background:
    "linear-gradient(180deg, rgba(2,6,23,0.05), rgba(2,6,23,0.38))",
};

const fiberLine: React.CSSProperties = {
  position: "absolute",
  left: "-12%",
  width: "124%",
  height: 2,
  background:
    "linear-gradient(90deg, transparent, rgba(56,189,248,0.08), rgba(56,189,248,0.95), rgba(250,204,21,0.74), transparent)",
  borderRadius: 999,
};

const fiberNode: React.CSSProperties = {
  position: "absolute",
  width: 12,
  height: 12,
  borderRadius: 999,
  background: "#38bdf8",
  border: "2px solid rgba(224,242,254,0.88)",
};

const section: React.CSSProperties = {
  padding: "68px 0",
  borderTop: "1px solid rgba(148,163,184,0.12)",
};

const sectionIntro: React.CSSProperties = {
  maxWidth: 780,
  marginBottom: 26,
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  color: "#ffffff",
  fontSize: "clamp(30px, 4vw, 48px)",
  lineHeight: 1.08,
  letterSpacing: 0,
};

const aboutGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 22,
};

const bodyCopy: React.CSSProperties = {
  margin: 0,
  color: "#cbd5e1",
  fontSize: 16,
  lineHeight: 1.75,
};

const productGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 14,
};

const platformGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const platformCard: React.CSSProperties = {
  minHeight: 170,
  background: "rgba(2,6,23,0.44)",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 8,
  padding: 20,
  boxSizing: "border-box",
};

const platformCardLive: React.CSSProperties = {
  ...platformCard,
  background: "linear-gradient(145deg, rgba(14,165,233,0.22), rgba(2,6,23,0.54))",
  border: "1px solid rgba(56,189,248,0.42)",
};

const platformHead: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 12,
};

const platformTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  lineHeight: 1.2,
};

const livePill: React.CSSProperties = {
  borderRadius: 999,
  padding: "5px 9px",
  background: "rgba(34,197,94,0.18)",
  color: "#bbf7d0",
  border: "1px solid rgba(34,197,94,0.38)",
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const soonPill: React.CSSProperties = {
  ...livePill,
  background: "rgba(148,163,184,0.12)",
  color: "#cbd5e1",
  border: "1px solid rgba(148,163,184,0.22)",
};

const platformCopy: React.CSSProperties = {
  margin: 0,
  color: "#cbd5e1",
  fontSize: 14,
  lineHeight: 1.6,
};

const productCard: React.CSSProperties = {
  minHeight: 178,
  background: "rgba(2,6,23,0.46)",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 8,
  padding: 20,
  boxSizing: "border-box",
};

const productKicker: React.CSSProperties = {
  margin: "0 0 10px",
  color: "#7dd3fc",
  fontSize: 12,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0,
};

const productTitle: React.CSSProperties = {
  margin: "0 0 10px",
  color: "#ffffff",
  fontSize: 20,
  lineHeight: 1.25,
};

const productCopy: React.CSSProperties = {
  margin: 0,
  color: "#aebdd0",
  fontSize: 14,
  lineHeight: 1.6,
};

const assetGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 14,
};

const assetTile: React.CSSProperties = {
  display: "flex",
  gap: 14,
  alignItems: "flex-start",
  background: "rgba(15,23,42,0.62)",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 8,
  padding: 18,
};

const assetIcon: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  flex: "0 0 36px",
  borderRadius: 8,
  background: "rgba(56,189,248,0.14)",
  color: "#7dd3fc",
  fontWeight: 900,
};

const assetTitle: React.CSSProperties = {
  margin: "0 0 6px",
  fontSize: 18,
};

const assetCopy: React.CSSProperties = {
  margin: 0,
  color: "#b6c6d9",
  fontSize: 14,
  lineHeight: 1.55,
};

const contactSection: React.CSSProperties = {
  ...section,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 390px)",
  gap: 24,
  alignItems: "start",
};

const contactPanel: React.CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 20,
  background: "rgba(2,6,23,0.5)",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 8,
};

const contactLink: React.CSSProperties = {
  color: "#e0f2fe",
  textDecoration: "none",
  fontWeight: 800,
  padding: "12px 0",
  borderBottom: "1px solid rgba(148,163,184,0.12)",
};

const siteFooter: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "8px 18px",
  padding: "28px 18px",
  color: "#7b8797",
  fontSize: 12,
  lineHeight: 1.4,
  borderTop: "1px solid rgba(148,163,184,0.12)",
  position: "relative",
  zIndex: 1,
};
