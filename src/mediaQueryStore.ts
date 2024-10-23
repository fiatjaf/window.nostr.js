import {writable} from 'svelte/store'

export default (mediaQueryString: string) => {
  const {subscribe, set} = writable<boolean>(undefined, () => {
    // start observing media query
    const mql = window.matchMedia(mediaQueryString)

    // set first media query result to the store
    set(mql.matches)

    // called when media query state changes
    const onchange = () => set(mql.matches)

    // listen for changes (need to support old `addListener` interface)
    mql.addEventListener('change', onchange)

    // when no more listeners
    return () => {
      // stop listening (need to support old `removeListener` interface)
      mql.removeEventListener('change', onchange)
    }
  })

  return {subscribe}
}
