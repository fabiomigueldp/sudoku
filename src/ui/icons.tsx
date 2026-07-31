import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const iconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

export function UndoIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M9 7 5 11l4 4" />
      <path d="M5 11h8.5a5.5 5.5 0 0 1 5.5 5.5" />
    </svg>
  )
}

export function RedoIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="m15 7 4 4-4 4" />
      <path d="M19 11h-8.5A5.5 5.5 0 0 0 5 16.5" />
    </svg>
  )
}

export function EraserIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="m7.2 19 11-11a2.6 2.6 0 0 0 0-3.7l-.5-.5a2.6 2.6 0 0 0-3.7 0l-11 11a2.6 2.6 0 0 0 0 3.7l.5.5Z" />
      <path d="m10 8 6 6M7.2 19H21" />
    </svg>
  )
}

export function LightbulbIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M9 18h6M10 22h4" />
      <path d="M8.5 14.5A6 6 0 1 1 15.5 14.5c-1 .7-1.5 1.7-1.5 3h-4c0-1.3-.5-2.3-1.5-3Z" />
    </svg>
  )
}

export function PauseIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M9 7v10M15 7v10" />
    </svg>
  )
}

export function PlayIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="m9 7 8 5-8 5Z" />
    </svg>
  )
}

export function SlidersIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </svg>
  )
}

export function ChartIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M5 20V10M12 20V4M19 20v-7" />
    </svg>
  )
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="m7 7 10 10M17 7 7 17" />
    </svg>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

export function MoreIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <circle cx="5" cy="12" r=".8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r=".8" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r=".8" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...iconProps} {...props}>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  )
}
