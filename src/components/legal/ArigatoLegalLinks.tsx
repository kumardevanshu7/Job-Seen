const LINKS = [
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/disclaimer", label: "Disclaimer" },
  { href: "/contact", label: "Contact" },
] as const;

export default function ArigatoLegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav className={`arigato-legal-links ${className}`.trim()} aria-label="Arigato Labs legal">
      {LINKS.map((link, i) => (
        <span key={link.href}>
          {i > 0 && <span className="arigato-legal-sep" aria-hidden="true">·</span>}
          <a href={link.href}>{link.label}</a>
        </span>
      ))}
    </nav>
  );
}
