/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#00d4aa',
          hover: '#00b894',
        },
        bg: '#0a0a0a',
        surface: '#2d2d2d',
        border: '#333',
      },
    },
  },
  plugins: [],
}
