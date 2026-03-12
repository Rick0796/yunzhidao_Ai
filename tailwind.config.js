/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        panel: "0 24px 80px rgba(15, 23, 42, 0.24)"
      },
      colors: {
        ink: {
          950: "#08111f"
        }
      }
    }
  },
  plugins: []
};
