/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#0B1220",
          card: "#121A2B",
          surface: "#182234",
        },
        border: {
          subtle: "#1F2A44",
          DEFAULT: "#24344D",
        },
        text: {
          primary: "#E5E7EB",
          muted: "#94A3B8",
        },
        // Slice Palettes (Only for share bars, bots, slice labels)
        slice: {
          embb: "#22D3EE",
          urllc: "#F59E0B",
          murllc: "#A78BFA",
        },
        // Policy Palettes (Only for chart lines and policy cards)
        policy: {
          static: "#F87171",
          heuristic: "#CBD5E1",
          agent: "#34D399",
        },
        // Status Palettes
        status: {
          ok: "#10B981",
          risk: "#F59E0B",
          breach: "#EF4444",
          notraffic: "#64748B",
          overload: "#8B5CF6",
        },
      },
      borderRadius: {
        xl: "12px",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
}
