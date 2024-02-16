export PATH := "./node_modules/.bin:" + env_var('PATH')

dev:
  vite

build:
  vite build
  mv dist/assets/*.js dist/window.nostr.js

demo:
  xdg-open demo/index.html

publish:
  just build
  npm publish
