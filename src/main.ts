import styles from './app.css?inline'
import App from './App.svelte'

// To customize the widget add this code before the <script src='...' inclusion
// --- --- --- --- --- --- --- --- ---
// <script>
//   window.wnjParams = {
//     position: 'bottom'
//     accent: 'green' // Supported values: cyan (default), green, purple, red, orange, neutral, stone
//   }
// </script>

const win = window as any

const base = document.createElement('div')
base.style.position = 'fixed'
base.style.right = '1.5rem'
if (win.wnjParams?.position === 'bottom') {
  base.style.bottom = '1.5rem'
} else {
  base.style.top = '1.5rem'
}
document.body.appendChild(base)

const mountPoint = document.createElement('div')
mountPoint.id = 'wnj'
mountPoint.classList.add('tw-animate-fadein')

const style = document.createElement('style')
style.innerHTML = styles

const shadowRoot = base.attachShadow({mode: 'open'})
shadowRoot.appendChild(mountPoint)
shadowRoot.appendChild(style)

const app = new App({
  target: mountPoint,
  props: {
    accent: win.wnjParams?.accent || 'cyan'
  }
})

export default app

// ~
;(window as any).destroyWnj = () => {
  app.$destroy()
}
