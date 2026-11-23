import type { CSSProperties } from 'react'
export function Icon({
  name = 'diamond',
  size = 20,
  className = '',
}: {
  name?: string
  size?: number
  className?: string
}) {
  const paths: Record<string, React.ReactNode> = {
    auction: (
      <>
        <path d="m14 3 7 7-3 3-7-7Zm-5 5 7 7-3 3-7-7ZM3 21h12M7 16l-4 4M9 14l-3 3" />
      </>
    ),
    display: (
      <>
        <rect x="4" y="3" width="16" height="14" rx="2" />
        <path d="m12 6 4 4-4 4-4-4ZM8 21h8M12 17v4" />
      </>
    ),
    storage: (
      <>
        <path d="M3 21V7l9-4 9 4v14ZM6 21V10h12v11M6 14h12M6 18h12" />
        <path d="M10 21v-2h4v2" />
      </>
    ),
    chat: (
      <>
        <path d="M21 11a8 8 0 0 1-8 8H6l-4 3V11a9 9 0 0 1 19 0Z" />
        <path d="M7 9h9M7 13h6" />
      </>
    ),
    npc: (
      <>
        <rect x="4" y="6" width="16" height="15" rx="3" />
        <path d="M12 2v4M8 11v2M16 11v2M9 17h6" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M3 21v-4a6 6 0 0 1 12 0v4M17 4a3 3 0 0 1 0 6M21 21v-4a6 6 0 0 0-4-5" />
      </>
    ),
    home: (
      <>
        <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
      </>
    ),
    packs: (
      <>
        <path d="m12 3 9 5-9 5-9-5 9-5Z" />
        <path d="m3 8 0 10 9 5 9-5V8M12 13v10M7 5l9 5" />
      </>
    ),
    collection: (
      <>
        <rect x="7" y="5" width="13" height="17" rx="2" />
        <path d="M15 2H5a2 2 0 0 0-2 2v13M11 10h5M11 14h5M11 18h3" />
      </>
    ),
    slots: (
      <>
        <rect x="3" y="6" width="16" height="14" rx="2" />
        <path d="M7 10v6m4-6v6m4-6v6M19 13h3V5" />
        <circle cx="22" cy="3" r="1" />
      </>
    ),
    market: (
      <>
        <path d="M3 10h18L19 3H5Zm1 0v11h16V10M9 21v-7h6v7M2 10a3 3 0 0 0 5 2 3 3 0 0 0 5 0 3 3 0 0 0 5 0 3 3 0 0 0 5-2" />
      </>
    ),
    trade: (
      <>
        <path d="M3 7h17m-5-5 5 5-5 5M21 17H4m5 5-5-5 5-5" />
      </>
    ),
    trophy: (
      <>
        <path d="M8 3h8v8a4 4 0 0 1-8 0Zm0 2H4v4a4 4 0 0 0 4 4m8-8h4v4a4 4 0 0 1-4 4M12 15v6M7 21h10" />
      </>
    ),
    updates: (
      <>
        <path d="M5 3h14v18H5ZM9 7h6M9 11h6M9 15h3" />
        <path d="m16 16 1 1 3-3" />
      </>
    ),
    settings: (
      <>
        <path d="m9 3-1 3-3 1-2 4 2 3v4l4 3 3-1 3 1 4-3v-4l2-3-2-4-3-1-1-3Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    down: <path d="m6 9 6 6 6-6" />,
    coin: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m12 7 4 5-4 5-4-5Z" />
      </>
    ),
    diamond: (
      <>
        <path d="m12 2 9 10-9 10L3 12Z" />
        <path d="m12 6 5 6-5 6-5-6Z" />
      </>
    ),
    spark: (
      <>
        <path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z" />
      </>
    ),
    bell: (
      <>
        <path d="M5 16V9a7 7 0 0 1 14 0v7l2 2H3ZM10 21h4" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    x: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    shield: (
      <>
        <path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z" />
        <path d="m8 11 3 3 5-5" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    list: <path d="M7 5h14M7 12h14M7 19h14M3 5h.01M3 12h.01M3 19h.01" />,
    logout: (
      <>
        <path d="M10 4H4v16h6M10 12h12m-5-5 5 5-5 5" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7h.01" />
      </>
    ),
    wallet: (
      <>
        <path d="M20 7V4H5a3 3 0 0 0 0 6h16v11H5a3 3 0 0 1-3-3V7M21 13h-5v5h5M18 15.5h.01" />
      </>
    ),
    flame: <path d="M12 2c1 6 7 6 7 13a7 7 0 0 1-14 0c0-3 2-5 3-6 0 5 4 5 4 1Z" />,
    history: (
      <>
        <path d="M3 11a9 9 0 1 1 3 8M3 4v7h7M12 7v5l4 2" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01" />
      </>
    ),
    menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  }
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.diamond}
    </svg>
  )
}
export const toneStyle = (tone: string) =>
  ({
    '--tone':
      (
        {
          violet: '#a58aff',
          blue: '#6b9eff',
          emerald: '#56d7b0',
          amber: '#edc277',
          rose: '#ef8aac',
        } as Record<string, string>
      )[tone] || tone,
  }) as CSSProperties
