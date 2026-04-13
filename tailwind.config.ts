import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/**/*.{js,ts,jsx,tsx}",
        "./app/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            boxShadow: {
                glow: "0 0 60px rgba(56, 189, 248, 0.12)",
            },
        },
    },
    plugins: [require("@tailwindcss/typography")],
};

export default config;
