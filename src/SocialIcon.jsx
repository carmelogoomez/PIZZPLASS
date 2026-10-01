export default function SocialIcon({ platform }) {
  const common = { className: 'social-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', 'data-social-icon': platform };

  if (platform === 'instagram') return <svg {...common} fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
  </svg>;

  if (platform === 'tiktok') return <svg {...common} fill="currentColor">
    <path d="M12.53.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.14.82 2.6 1.49 4.12 1.66v4.03a12.15 12.15 0 0 1-4.08-.99c-.01 3.92.01 7.83-.03 11.74-.22 1.88-1.14 3.67-2.61 4.86-2.26 1.91-5.73 2.18-8.28.7-2.55-1.42-3.84-4.44-3.42-7.28.4-2.8 2.6-5.17 5.37-5.72.85-.18 1.73-.11 2.59-.08.02 1.48-.04 2.96-.04 4.44-1.27-.41-2.75-.3-3.69.72-1.01.95-1.18 2.58-.48 3.76.68 1.16 2.14 1.68 3.4 1.28 1.38-.42 2.28-1.84 2.28-3.27.02-5.68-.01-11.35.03-17.03Z" />
  </svg>;

  if (platform === 'whatsapp') return <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.2 11.6a8.2 8.2 0 0 1-12 7.25L3.5 20.3l1.48-4.52A8.2 8.2 0 1 1 20.2 11.6Z" />
    <path d="M8.15 7.7c.3-.34.63-.4.9-.08l1.18 1.55c.2.27.13.58-.08.84l-.62.74c.7 1.34 1.77 2.4 3.12 3.08l.72-.64c.27-.23.58-.29.85-.08l1.53 1.2c.32.26.26.6-.08.9-.62.55-1.43.82-2.25.57-3.73-1.14-6.13-3.53-7.25-7.27-.25-.83.03-1.63.58-2.25Z" />
  </svg>;

  return null;
}
