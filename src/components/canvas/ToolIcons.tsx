import type { Tool } from '../../types/circuit'

const toolIconSvgProps = {
  className: 'tool-icon-svg',
  viewBox: '0 0 24 24',
  width: 22,
  height: 22,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.65,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
}

export function ToolIcon({ tool }: { tool: Exclude<Tool, 'none'> }) {
  switch (tool) {
    case 'battery':
      return (
        <svg {...toolIconSvgProps}>
          <path d="M3 12h4M17 12h4" />
          <path d="M8 7v10M12 5v14" />
        </svg>
      )
    case 'resistor':
      return (
        <svg {...toolIconSvgProps}>
          <path d="M2 12h2.5l2-3.5 2.5 7 2.5-7 2.5 7 2.5-7 2.5 3.5H22" />
        </svg>
      )
    case 'led':
      return (
        <svg {...toolIconSvgProps}>
          <path d="M3 12h4l7-6v12L7 12H3" />
          <path d="M14 7l3 3-3 3M14 17l3-3-3-3" />
          <path d="M19 12h2.5" />
        </svg>
      )
    case 'capacitor':
      return (
        <svg {...toolIconSvgProps}>
          <path d="M3 12h5M16 12h5" />
          <path d="M10 5v14M14 5v14" />
        </svg>
      )
    case 'wire':
      return (
        <svg {...toolIconSvgProps}>
          <path d="M3 12h18" />
        </svg>
      )
    case 'text':
      return (
        <svg {...toolIconSvgProps}>
          <text
            x="12"
            y="12"
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="16"
            fontWeight="700"
            fill="currentColor"
            stroke="none"
            fontFamily="system-ui, Segoe UI, sans-serif"
          >
            T
          </text>
        </svg>
      )
  }
}
