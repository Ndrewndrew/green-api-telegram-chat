import type { ReactNode } from 'react';

export function Icon({
  name,
}: {
  name: 'send' | 'chat' | 'back' | 'exit' | 'plus' | 'search';
}) {
  const paths: Record<typeof name, ReactNode> = {
    send: (
      <>
        <path d="m3 10 18-7-7 18-3-8-8-3Z" />
        <path d="m11 13 10-10" />
      </>
    ),
    chat: <path d="M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0Z" />,
    back: <path d="m14 5-7 7 7 7" />,
    exit: (
      <>
        <path d="M9 4H4v16h5M9 12h12m-4-4 4 4-4 4" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
