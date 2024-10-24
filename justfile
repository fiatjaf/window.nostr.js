export PATH := "./node_modules/.bin:" + env_var('PATH')
set unstable

dev:
  vite --port 13471

build:
  vite build
  mv dist/assets/*.js dist/window.nostr.js

demo:
  xdg-open demo/index.html

publish:
  just build
  npm publish
