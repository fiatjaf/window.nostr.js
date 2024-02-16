import './app.css'
import App from './App.svelte'

const div = document.createElement('div')
document.body.appendChild(div)
div.id = 'windowNostrModal'

// To move the widget to the bottom add this code before the <script src='...' inclusion
// --- --- --- --- --- --- --- --- --- 
// <script>
//   window.windowNostrJsParams = {
//     position: 'bottom'
//   }
// </script>

const position = (window as any).windowNostrJsParams ? (window as any).windowNostrJsParams.position || 'top' : 'top';

div.classList.add(
  'tw-fixed',
  'tw-right-6',
  'tw-animate-fadein'
)

if (position === 'bottom') {
  div.classList.add(
    'tw-bottom-6',
  )
} else {
  div.classList.add(
    'tw-top-6',
  )
}

const app = new App({
  target: div
})

export default app

// ~
;(window as any).destroyWnj= () => {
  app.$destroy()
}
