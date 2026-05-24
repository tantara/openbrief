import { ImageResponse } from "next/og";

// Site-wide Open Graph / Twitter card image (1200x630).
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "OpenBrief — turn long videos and audio into clear briefs";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0a0a0a",
          color: "#fafafa",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              background: "#fafafa",
              color: "#0a0a0a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "40px",
              fontWeight: 700,
            }}
          >
            O
          </div>
          <div style={{ fontSize: "40px", fontWeight: 600 }}>OpenBrief</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ fontSize: "72px", fontWeight: 700, lineHeight: 1.1 }}>
            Turn long videos into briefs you can act on.
          </div>
          <div style={{ fontSize: "34px", color: "#a3a3a3" }}>
            Local-first. No account. Yours, on your device.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
