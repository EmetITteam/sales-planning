import { ImageResponse } from 'next/og';

// PWA іконка 512×512 — EMET-лого білим на синьому градієнті.
// Узгоджується з meeting-app-production/icons/icon-512.png (мʼятно-зелений
// «EMET»), але для sales-planning використовуємо синій градієнт як base.
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
          fontFamily: 'system-ui, sans-serif',
          fontWeight: 800,
          fontSize: 200,
          color: 'white',
          letterSpacing: -10,
        }}
      >
        EMÉT
      </div>
    ),
    { ...size },
  );
}
