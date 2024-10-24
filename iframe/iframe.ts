const SHARED_BUNKER_KEY = 'wnj:root:sharedBunker'

window.onmessage = async (ev: MessageEvent) => {
  const {bunker, getbunker} = ev.data

  // set the bunker URL
  if (bunker) {
    // we only accept these websites to be setting the bunker URL
    if (
      !ev.origin.startsWith('https://join.the-nostr.org') &&
      !ev.origin.startsWith('http://localhost:6711')
    ) {
      return
    }

    if (bunker) {
      localStorage.setItem(SHARED_BUNKER_KEY, bunker)
    } else {
      console.error('wnj iframe got an invalid bunker url:', bunker)
    }
  }

  if (getbunker) {
    // any website can get the bunker URL if it is set
    const bunker = localStorage.getItem(SHARED_BUNKER_KEY)
    window.parent.postMessage({bunker}, '*') // we reply even if it's undefined so they know
  }
}
