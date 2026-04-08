import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#775a19",
          50: "#f5f0e8",
          100: "#e8dcc5",
          200: "#d4be8f",
          300: "#c5a059",
          400: "#b08a3d",
          500: "#775a19",
          600: "#5e4714",
          700: "#453410",
          800: "#2d220b",
          900: "#141105",
        },
        surface: {
          DEFAULT: "#fcf9f8",
          50: "#ffffff",
          100: "#fcf9f8",
          200: "#f5f0ed",
          300: "#ebe4df",
          400: "#e0d5cf",
          500: "#d4c7be",
        },
        inverse: {
          DEFAULT: "#313030",
          50: "#5a5a5a",
          100: "#505050",
          200: "#464646",
          300: "#3c3c3c",
          400: "#363636",
          500: "#313030",
          600: "#2a2a2a",
          700: "#232323",
          800: "#1c1c1c",
          900: "#151515",
        },
        gold: {
          DEFAULT: "#775a19",
          light: "#c5a059",
          dark: "#5e4714",
        },
        success: "#2e7d32",
        warning: "#ed6c02",
        error: "#ba1a1a",
        info: "#0288d1",
      },
      fontFamily: {
        heading: ["Noto Serif", "Georgia", "serif"],
        body: ["Manrope", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        sm: "0.125rem",
        md: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
      },
      boxShadow: {
        "ambient": "0 12px 40px rgba(49, 48, 48, 0.06)",
        "card": "0 4px 12px rgba(49, 48, 48, 0.04)",
        "modal": "0 24px 64px rgba(49, 48, 48, 0.12)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      screens: {
        "xs": "320px",
        "sm": "640px",
        "md": "768px",
        "lg": "1024px",
        "xl": "1280px",
        "2xl": "1536px",
        "phone-sm": "320px",
        "phone": "375px",
        "phone-lg": "425px",
        "tablet": "768px",
      },
      spacing: {
        "18": "4.5rem",
        "88": "22rem",
      },
    },
  },
  plugins: [],
};
export default config;
