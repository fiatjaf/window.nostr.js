import './app.css'
import App from './App.svelte'

const div = document.createElement('div')
document.body.appendChild(div)
div.id = 'windowNostrModal'
div.classList.add(
  'tw-fixed',
  'tw-top-6',
  'tw-right-6',
)

const app = new App({
  target: div
})

export default app

// ~
;(window as any).destroyWnj= () => {
  app.$destroy()
}
