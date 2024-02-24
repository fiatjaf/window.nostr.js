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
  prefix: '',
  safelist: [
    'bg-cyan-700', 'hover:bg-cyan-700', 'bg-cyan-800', 'hover:bg-cyan-800', 'bg-cyan-900', 'hover:bg-cyan-900', 'bg-cyan-950', 'hover:bg-cyan-950', 'text-cyan-600', 'outline-cyan-500', 'from-cyan-900', 'to-cyan-700',
    'bg-green-700', 'hover:bg-green-700', 'bg-green-800', 'hover:bg-green-800', 'bg-green-900', 'hover:bg-green-900', 'bg-green-950', 'hover:bg-green-950', 'text-green-600', 'outline-green-500', 'from-green-900', 'to-green-700',
    'bg-purple-700', 'hover:bg-purple-700', 'bg-purple-800', 'hover:bg-purple-800', 'bg-purple-900', 'hover:bg-purple-900', 'bg-purple-950', 'hover:bg-purple-950', 'text-purple-600', 'outline-purple-500', 'from-purple-900', 'to-purple-700',
    'bg-red-700', 'hover:bg-red-700', 'bg-red-800', 'hover:bg-red-800', 'bg-red-900', 'hover:bg-red-900', 'bg-red-950', 'hover:bg-red-950', 'text-red-600', 'outline-red-500', 'from-red-900', 'to-red-700',
    'bg-orange-700', 'hover:bg-orange-700', 'bg-orange-800', 'hover:bg-orange-800', 'bg-orange-900', 'hover:bg-orange-900', 'bg-orange-950', 'hover:bg-orange-950', 'text-orange-600', 'outline-orange-500', 'from-orange-900', 'to-orange-700',
    'bg-neutral-700', 'hover:bg-neutral-700', 'bg-neutral-800', 'hover:bg-neutral-800', 'bg-neutral-900', 'hover:bg-neutral-900', 'bg-neutral-950', 'hover:bg-neutral-950', 'text-neutral-600', 'outline-neutral-500', 'from-neutral-900', 'to-neutral-700',
    'bg-stone-700', 'hover:bg-stone-700', 'bg-stone-800', 'hover:bg-stone-800', 'bg-stone-900', 'hover:bg-stone-900', 'bg-stone-950', 'hover:bg-stone-950', 'text-stone-600', 'outline-stone-500', 'from-stone-900', 'to-stone-700',
  ]
}
