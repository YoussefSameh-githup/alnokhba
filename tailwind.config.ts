import type { Config } from "tailwindcss";

/**
 * Al Nokhba Educational Center brand theme.
 * RTL: prefer logical utilities (ms-/me-/ps-/pe-/start-/end-/text-start) so
 * layouts mirror automatically with <html dir="rtl">.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#E52328",
          50: "#FEF2F2",
          100: "#FDE3E4",
          200: "#FBCBCC",
          300: "#F7A3A6",
          400: "#F06B70",
          500: "#E52328",
          600: "#C8171C",
          700: "#A81318",
          800: "#8B1518",
          900: "#73171A",
        },
        ink: {
          DEFAULT: "#1A1A1A",
          soft: "#3D3D3D",
          muted: "#6B7280",
        },
        surface: {
          DEFAULT: "#F8F9FA",
          card: "#FFFFFF",
          line: "#E9ECEF",
        },
        paid: { DEFAULT: "#059669", soft: "#D1FAE5" },     // emerald
        unpaid: { DEFAULT: "#E52328", soft: "#FDE3E4" },   // crimson
        pending: { DEFAULT: "#D97706", soft: "#FEF3C7" },  // amber
      },
      fontFamily: {
        sans: ["var(--font-cairo)", "system-ui", "sans-serif"],
      },
      borderRadius: { xl: "0.875rem", "2xl": "1.25rem" },
      boxShadow: {
        card: "0 1px 2px rgba(26,26,26,0.04), 0 4px 16px rgba(26,26,26,0.06)",
        glow: "0 0 0 4px rgba(229,35,40,0.15)",
      },
      keyframes: {
        scanline: {
          "0%": { top: "3%" },
          "100%": { top: "96%" },
        },
      },
      animation: { scanline: "scanline 1.6s ease-in-out infinite alternate" },
    },
  },
  plugins: [],
};
export default config;
