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
base.style.zIndex = '10000'
document.body.appendChild(base)

const mountPoint = document.createElement('div')
mountPoint.id = 'wnj'

const style = document.createElement('style')
style.innerHTML = styles

const shadowRoot = base.attachShadow({mode: 'open'})
shadowRoot.appendChild(mountPoint)
shadowRoot.appendChild(style)

const app = new App({
  target: mountPoint,
  props: {
    accent: win.wnjParams?.accent || 'cyan',
    position: win.wnjParams?.position === 'bottom' ? 'bottom' : 'top'
  }
})

export default app

// ~
;(window as any).destroyWnj = () => {
  app.$destroy()
}
