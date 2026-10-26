import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#17191e", soft: "#2a2e37" },
        bone: "#f3efe7",
        paper: "#fbf9f5",
        brass: { DEFAULT: "#9a7340", bright: "#c4a36a" },
        pine: "#1f4d3a",
        clay: "#8c3d36",
        tide: "#2c4a6e",
        line: "#e4ddd2",
      },
      fontFamily: {
        sans: ["var(--font-outfit)", "Segoe UI", "PingFang SC", "Microsoft YaHei", "sans-serif"],
        serif: ["var(--font-fraunces)", "Songti SC", "SimSun", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
