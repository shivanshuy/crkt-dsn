/**
 * Text-only wordmark — gold metallic gradient on the dark toolbar.
 */
export function CrktDsnWordmark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 136 36"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="crkt-dsn"
    >
      <title>crkt-dsn</title>
      <defs>
        <linearGradient id="crktGold" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#b8860b" />
          <stop offset="35%" stopColor="#f0e6c8" />
          <stop offset="65%" stopColor="#c9a227" />
          <stop offset="100%" stopColor="#8b6914" />
        </linearGradient>
      </defs>
      <text
        x={68}
        y={25}
        textAnchor="middle"
        fontFamily="ui-monospace, 'Cascadia Code', 'Consolas', 'Segoe UI Mono', monospace"
        fontSize={21}
        fontWeight={700}
        letterSpacing="0.02em"
        fill="url(#crktGold)"
        stroke="#0f172a"
        strokeWidth={0.35}
        paintOrder="stroke fill"
      >
        crkt-dsn
      </text>
    </svg>
  )
}
