const ribbonIconSvgProps = {
  className: 'ribbon-icon-svg',
  viewBox: '0 0 24 24',
  width: 18,
  height: 18,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
}

/** Maximize-style corners — “show more” */
export function RibbonExpandIcon() {
  return (
    <svg {...ribbonIconSvgProps}>
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  )
}

/** Minimize-style corners — “show less” */
export function RibbonCollapseIcon() {
  return (
    <svg {...ribbonIconSvgProps}>
      <path d="M4 14v6h6M20 10h-6V4M4 10l6-6M20 14l-6 6" />
    </svg>
  )
}

export function RibbonCloseIcon() {
  return (
    <svg {...ribbonIconSvgProps}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}
