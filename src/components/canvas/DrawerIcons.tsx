const drawerIconSvgProps = {
  className: 'drawer-icon-svg',
  viewBox: '0 0 24 24',
  width: 20,
  height: 20,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
}

/** Points left — “open panel from the right” */
export function DrawerOpenChevronIcon() {
  return (
    <svg {...drawerIconSvgProps}>
      <path d="M15 6L9 12l6 6" />
    </svg>
  )
}

/** Points right — “collapse panel to the right” */
export function DrawerCloseChevronIcon() {
  return (
    <svg {...drawerIconSvgProps}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}
