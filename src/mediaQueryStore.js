import {writable} from 'svelte/store'

/**
 * Svelte Media Query Store
 * @param mediaQueryString { string }
 */
export default mediaQueryString => {
  const {subscribe, set} = writable(undefined, () => {
    // Start observing media query
    let mql = window.matchMedia(mediaQueryString)

    // Set first media query result to the store
    set(mql.matches)

    // Called when media query state changes
    const onchange = () => set(mql.matches)

    // Listen for changes (need to support old `addListener` interface)
    'addEventListener' in mql
      ? mql.addEventListener('change', onchange)
      : mql.addListener(onchange)

    // when no more listeners
    return () => {
      // stop listening (need to support old `removeListener` interface)
      'removeEventListener' in mql
        ? mql.removeEventListener('change', onchange)
        : mql.removeListener(onchange)
    }
  })

  return {subscribe}
}
