import './app.css'
import App from './App.svelte'

const div = document.createElement('div')
document.body.appendChild(div)
div.id = 'windowNostrModal'
div.classList.add(
  'tw-fixed',
  'tw-top-4',
  'tw-right-4',
  'tw-bg-zinc-100',
  'tw-drop-shadow-md',
  'tw-rounded'
)

const app = new App({
  target: div
})

export default app
