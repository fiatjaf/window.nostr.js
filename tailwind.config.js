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
  prefix: 'tw-',
  safelist: [
    'tw-bg-cyan-700', 'hover:tw-bg-cyan-700', 'tw-bg-cyan-800', 'hover:tw-bg-cyan-800', 'tw-bg-cyan-900', 'hover:tw-bg-cyan-900', 'tw-bg-cyan-950', 'hover:tw-bg-cyan-950', 'tw-text-cyan-600', 'tw-outline-cyan-500', 'tw-from-cyan-900', 'tw-to-cyan-700',
    'tw-bg-green-700', 'hover:tw-bg-green-700', 'tw-bg-green-800', 'hover:tw-bg-green-800', 'tw-bg-green-900', 'hover:tw-bg-green-900', 'tw-bg-green-950', 'hover:tw-bg-green-950', 'tw-text-green-600', 'tw-outline-green-500', 'tw-from-green-900', 'tw-to-green-700',
    'tw-bg-purple-700', 'hover:tw-bg-purple-700', 'tw-bg-purple-800', 'hover:tw-bg-purple-800', 'tw-bg-purple-900', 'hover:tw-bg-purple-900', 'tw-bg-purple-950', 'hover:tw-bg-purple-950', 'tw-text-purple-600', 'tw-outline-purple-500', 'tw-from-purple-900', 'tw-to-purple-700',
    'tw-bg-red-700', 'hover:tw-bg-red-700', 'tw-bg-red-800', 'hover:tw-bg-red-800', 'tw-bg-red-900', 'hover:tw-bg-red-900', 'tw-bg-red-950', 'hover:tw-bg-red-950', 'tw-text-red-600', 'tw-outline-red-500', 'tw-from-red-900', 'tw-to-red-700',
    'tw-bg-orange-700', 'hover:tw-bg-orange-700', 'tw-bg-orange-800', 'hover:tw-bg-orange-800', 'tw-bg-orange-900', 'hover:tw-bg-orange-900', 'tw-bg-orange-950', 'hover:tw-bg-orange-950', 'tw-text-orange-600', 'tw-outline-orange-500', 'tw-from-orange-900', 'tw-to-orange-700',
    'tw-bg-neutral-700', 'hover:tw-bg-neutral-700', 'tw-bg-neutral-800', 'hover:tw-bg-neutral-800', 'tw-bg-neutral-900', 'hover:tw-bg-neutral-900', 'tw-bg-neutral-950', 'hover:tw-bg-neutral-950', 'tw-text-neutral-600', 'tw-outline-neutral-500', 'tw-from-neutral-900', 'tw-to-neutral-700',
    'tw-bg-stone-700', 'hover:tw-bg-stone-700', 'tw-bg-stone-800', 'hover:tw-bg-stone-800', 'tw-bg-stone-900', 'hover:tw-bg-stone-900', 'tw-bg-stone-950', 'hover:tw-bg-stone-950', 'tw-text-stone-600', 'tw-outline-stone-500', 'tw-from-stone-900', 'tw-to-stone-700',
  ]
}
