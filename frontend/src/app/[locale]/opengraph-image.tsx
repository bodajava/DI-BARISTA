import { ImageResponse } from 'next/og';

export const alt = 'DIBARESTA CAFFE: specialty coffee roastery in Cairo';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Default social preview card used when a page has no product image of its own */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: '#EFE6D6',
          color: '#26211F',
          border: '24px solid #26211F',
        }}
      >
        <div style={{ fontSize: 34, letterSpacing: 8, color: '#B5573A' }}>
          SPECIALTY COFFEE ROASTERY · CAIRO
        </div>
        <div style={{ fontSize: 120, fontWeight: 700, marginTop: 24 }}>
          DIBARESTA CAFFE
        </div>
        <div style={{ fontSize: 40, marginTop: 24, opacity: 0.8 }}>
          Fresh single origins, espresso blends & brewing gear, delivered across Egypt
        </div>
      </div>
    ),
    size,
  );
}
