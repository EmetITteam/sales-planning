import { ImageResponse } from 'next/og';

// PWA іконка 512×512 з градієнтом EMET-синього + chart-стиль символ.
// Next.js обслуговує її як /icon. Manifest посилається на цю URL.
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #066aab 0%, #0880cc 100%)',
        }}
      >
        {/* Спрощена версія BarChart3 з lucide-react — три стовпці різної висоти */}
        <svg
          width="280"
          height="280"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 3v16a2 2 0 0 0 2 2h16" />
          <path d="M18 17V9" />
          <path d="M13 17V5" />
          <path d="M8 17v-3" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
