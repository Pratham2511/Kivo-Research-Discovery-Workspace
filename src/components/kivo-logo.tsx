interface KivoLogoProps {
  className?: string;
  markOnly?: boolean;
}

/** The open spine and paired angled pages form Kivo's source-mark K. */
export function KivoLogo({ className = "", markOnly = false }: KivoLogoProps) {
  return (
    <span className={"kivo-logo " + className}>
      <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className="kivo-logo-mark">
        <path d="M6 7h6v26H6V7Z" fill="currentColor" />
        <path d="m16 20 13-13h8L24 20l13 13h-8L16 20Z" fill="currentColor" />
        <path d="M16 7h6v8l-6 6V7Z" fill="currentColor" opacity=".45" />
      </svg>
      {!markOnly && <span className="kivo-wordmark">kivo<span>.</span></span>}
    </span>
  );
}
