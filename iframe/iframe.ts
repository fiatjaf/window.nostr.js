import {parseBunkerInput} from 'nostr-tools/nip46'
import {localStorageKeys} from '../src/lib'

window.onmessage = async (ev: MessageEvent) => {
  if (
    !ev.origin.startsWith('https://join.the-nostr.org') &&
    !ev.origin.startsWith('http://localhost:6711')
  ) {
    return
  }

  const {bunker} = ev.data
  if (bunker) {
    const bp = await parseBunkerInput(bunker)
    if (bp) {
      localStorage.setItem(localStorageKeys.BUNKER_POINTER, JSON.stringify(bp))
    } else {
      console.error('wnj iframe got an invalid bunker url:', bunker)
    }
  }
}
