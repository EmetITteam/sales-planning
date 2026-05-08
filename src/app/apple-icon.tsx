import { ImageResponse } from 'next/og';

// iOS apple-touch-icon 180×180. Apple НЕ дотримується PWA стандарту до кінця —
// рамку додає сам, тому без додаткового padding (на відміну від maskable Android).
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
          fontFamily: 'system-ui, sans-serif',
          fontWeight: 800,
          fontSize: 70,
          color: 'white',
          letterSpacing: -3,
        }}
      >
        EMÉT
      </div>
    ),
    { ...size },
  );
}
