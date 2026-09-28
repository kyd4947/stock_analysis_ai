import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon512() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#047857",
          borderRadius: 112,
        }}
      >
        <svg width="304" height="304" viewBox="0 0 24 24" fill="none">
          <path
            d="M7.5 3.5v2.2M7.5 14.3v2.2M16.5 6.5v2.2M16.5 17.3v2.2"
            stroke="white"
            stroke-width="1.8"
            stroke-linecap="round"
          />
          <rect x="4.8" y="5.7" width="5.4" height="8.6" rx="1.6" fill="white" />
          <rect x="13.8" y="8.7" width="5.4" height="8.6" rx="1.6" fill="white" opacity="0.55" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
