import type { Config } from "tailwindcss";

/**
 * Al Nokhba design system.
 *  brand    — premium crimson (#DC2626 / #991B1B)
 *  ink      — deep charcoal text & dark surfaces (#0F172A / #020617)
 *  surface  — slate off-white canvas, white cards, hairline borders
 *  paid / unpaid / pending — status semantics (always paired with text, never color alone)
 *
 * RTL: use logical utilities (ms-/me-/ps-/pe-/start-/end-/text-start) so layouts mirror with dir="rtl".
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#DC2626",
          50: "#FEF2F2",
          100: "#FEE2E2",
          200: "#FECACA",
          300: "#FCA5A5",
          400: "#F87171",
          500: "#EF4444",
          600: "#DC2626",
          700: "#B91C1C",
          800: "#991B1B",
          900: "#7F1D1D",
        },
        ink: {
          DEFAULT: "#0F172A",
          deep: "#020617",
          soft: "#334155",
          muted: "#64748B",
          faint: "#94A3B8",
        },
        surface: {
          DEFAULT: "#F8FAFC",
          card: "#FFFFFF",
          subtle: "#F1F5F9",
          line: "#E2E8F0",
          strong: "#CBD5E1",
        },
        paid: { DEFAULT: "#059669", soft: "#ECFDF5", line: "#A7F3D0" },
        unpaid: { DEFAULT: "#DC2626", soft: "#FEF2F2", line: "#FECACA" },
        pending: { DEFAULT: "#D97706", soft: "#FFFBEB", line: "#FDE68A" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(15 23 42 / 0.04)",
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.03)",
        pop: "0 10px 38px -10px rgb(2 6 23 / 0.25), 0 10px 20px -15px rgb(2 6 23 / 0.15)",
        ring: "0 0 0 4px rgb(220 38 38 / 0.12)",
      },
      keyframes: {
        scanline: { "0%": { top: "4%" }, "100%": { top: "94%" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        scanline: "scanline 1.6s ease-in-out infinite alternate",
        "fade-in": "fade-in 150ms ease-out",
        "slide-up": "slide-up 180ms cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
