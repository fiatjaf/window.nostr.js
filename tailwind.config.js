/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,ts,svelte}'],
  theme: {
    extend: {
      animation: {
        fadein: 'fadeIn 1s ease-in-out, moveIn 1s ease-in-out',
        show: 'fadeIn 200ms ease-in-out',
      },
      // that is actual animation
      keyframes: theme => ({
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        moveIn: {
          '0%': { transform: 'translateY(-10px)' },
          '100%': { transform: 'translateY(0)' },
        },
      }),
    }
  },
  plugins: [],
  prefix: 'tw-'
}
