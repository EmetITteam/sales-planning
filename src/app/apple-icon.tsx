import { ImageResponse } from 'next/og';

// iOS apple-touch-icon 180×180. Apple сам додає рамку/скруглення.
// EMET-знак білим на фірмовому навакі #081E2D (як <img> data-URI — resvg).
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

const MARK_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 150.47 143.27'>" +
  "<path fill='#ffffff' d='m69.41,23.11L90.62,1.89c1.22-1.22,2.85-1.89,4.59-1.89s3.37.67,4.59,1.89c1.24,1.24,1.91,2.87,1.88,4.61-.02,1.69-.71,3.25-1.92,4.4l-21.28,21.28c-1.19,1.19-2.84,1.87-4.53,1.87s-3.29-.63-4.53-1.87c-2.54-2.54-2.54-6.53,0-9.07Z'/>" +
  "<path fill='#ffffff' d='m142.36,67.35H46.06c-16.52,0-29.95,13.44-29.95,29.95s13.44,29.95,29.95,29.95h96.3c4.54,0,8.1,3.48,8.1,7.91s-3.63,8.1-8.1,8.1H46.06C20.66,143.27,0,122.61,0,97.21s20.66-46.06,46.06-46.06h96.3c4.47,0,8.1,3.63,8.1,8.1s-3.63,8.1-8.1,8.1Z'/>" +
  "<path fill='#ffffff' d='m150.47,97.3c0,4.47-3.63,8.1-8.1,8.1H46.06c-4.54,0-8.1-3.56-8.1-8.1s3.63-8.1,8.1-8.1h96.3c4.47,0,8.1,3.63,8.1,8.1Z'/>" +
  "</svg>";
const MARK_URI = `data:image/svg+xml;base64,${btoa(MARK_SVG)}`;

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
          background: 'linear-gradient(135deg, #081E2D 0%, #0f3a52 100%)',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MARK_URI} width={116} height={110} alt="EMET" />
      </div>
    ),
    { ...size },
  );
}
