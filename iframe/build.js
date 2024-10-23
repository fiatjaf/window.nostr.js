import {build} from 'esbuild'

build({
  entryPoints: ['iframe/iframe.ts'],
  bundle: true,
  sourcemap: 'external',
  outfile: 'dist/iframe.js',
  format: 'iife'
}).then(() => console.log('iframe built'))
