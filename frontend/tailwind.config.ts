import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.5rem", screens: { "2xl": "1400px" } },
    extend: {
      fontFamily: {
        sans: ["Inter Variable", "Inter", "Segoe UI", "system-ui", "-apple-system", "sans-serif"],
      },
      colors: {
        border:     "hsl(var(--border))",
        input:      "hsl(var(--input))",
        ring:       "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: {
          DEFAULT: "hsl(var(--foreground))",
          muted:   "hsl(var(--muted-foreground))",
          warning: "hsl(var(--warning))",
          danger:  "hsl(var(--danger))",
          success: "hsl(var(--success))",
        },
        primary: {
          DEFAULT:    "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover:      "#34536B",
        },
        secondary: {
          DEFAULT:    "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT:    "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
          faint:      "hsl(var(--muted))",
        },
        accent: {
          DEFAULT:    "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT:    "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          background: "hsl(var(--destructive-background))",
          faint:      "hsl(var(--destructive-background))",
        },
        danger: {
          DEFAULT:    "hsl(var(--danger))",
          foreground: "hsl(var(--danger-foreground))",
          background: "hsl(var(--danger-background))",
          faint:      "hsl(var(--danger-background))",
        },
        success: {
          DEFAULT:    "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          background: "hsl(var(--success-background))",
          faint:      "hsl(var(--success-background))",
        },
        warning: {
          DEFAULT:    "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          background: "hsl(var(--warning-background))",
          faint:      "hsl(var(--warning-background))",
        },
        info: {
          DEFAULT:    "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
          background: "hsl(var(--info-background))",
        },
        card: {
          DEFAULT:    "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        surface: {
          DEFAULT:   "hsl(var(--card))",
          secondary: "hsl(var(--muted))",
        },
        sidebar: {
          DEFAULT:    "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          muted:      "hsl(var(--sidebar-muted))",
          accent:     "hsl(var(--sidebar-accent))",
          border:     "hsl(var(--sidebar-border))",
        },
        warm: {
          50:  "#FBF7EF",
          100: "#F3EDE2",
          200: "#EAE1D3",
          300: "#DDD4C7",
          400: "#C4B8A5",
          500: "#A99B88",
        },
        navy: {
          900: "#172D46",
          800: "#203B5A",
          700: "#29435D",
          600: "#426783",
          500: "#7891A4",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        "card":     "0 1px 3px 0 rgb(41 51 61 / 0.06), 0 1px 2px -1px rgb(41 51 61 / 0.04)",
        "card-md":  "0 4px 8px -2px rgb(41 51 61 / 0.08), 0 2px 4px -2px rgb(41 51 61 / 0.05)",
        "elevated": "0 8px 16px -4px rgb(41 51 61 / 0.10), 0 4px 8px -4px rgb(41 51 61 / 0.06)",
        "inset":    "inset 0 1px 2px 0 rgb(41 51 61 / 0.05)",
        "xs":       "0 1px 2px 0 rgb(41 51 61 / 0.05)",
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      spacing: {
        "4.5": "1.125rem",
        "7.5": "1.875rem",
        "8.5": "2.125rem",
        "13":  "3.25rem",
      },
      keyframes: {
        "fade-in":  { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "slide-in": { from: { transform: "translateX(-10px)", opacity: "0" }, to: { transform: "translateX(0)", opacity: "1" } },
        "scale-in": { from: { opacity: "0", transform: "scale(0.96)" }, to: { opacity: "1", transform: "scale(1)" } },
      },
      animation: {
        "fade-in":  "fade-in 0.2s ease-out",
        "slide-in": "slide-in 0.2s ease-out",
        "scale-in": "scale-in 0.15s ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
