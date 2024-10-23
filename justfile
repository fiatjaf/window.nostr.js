export PATH := "./node_modules/.bin:" + env_var('PATH')
set unstable

dev:
  vite --port 13471

build: wnj iframe

wnj:
  vite build
  mv dist/assets/*.js dist/window.nostr.js

iframe:
  node ./iframe/build.js
  cp ./iframe/iframe.html dist/

demo:
  xdg-open demo/index.html

publish:
  just build
  npm publish
