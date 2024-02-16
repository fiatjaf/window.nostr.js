import './app.css'
import App from './App.svelte'

const div = document.createElement('div')
document.body.appendChild(div)
div.id = 'windowNostrModal'

// To customize the widget add this code before the <script src='...' inclusion
// --- --- --- --- --- --- --- --- ---
// <script>
//   window.windowNostrJsParams = {
//     position: 'bottom'
//     accent: 'green' // Supported values: cyan (default), green, purple, red, orange, neutral, stone
//   }
// </script>

const position = (window as any).windowNostrJsParams
  ? (window as any).windowNostrJsParams.position || 'top'
  : 'top'
const accent = (window as any).windowNostrJsParams
  ? (window as any).windowNostrJsParams.accent || 'cyan'
  : 'cyan'

div.classList.add('tw-fixed', 'tw-right-6', 'tw-animate-fadein')

if (position === 'bottom') {
  div.classList.add('tw-bottom-6')
} else {
  div.classList.add('tw-top-6')
}

const app = new App({
  target: div,
  props: {
    accent: accent
  }
})

export default app

// ~
;(window as any).destroyWnj = () => {
  app.$destroy()
}
