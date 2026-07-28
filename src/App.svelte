<script lang="ts">
  import {pool} from '@nostr/gadgets/global'
  import QRCode from 'qrcode'
  import debounce from 'debounce'
  import {hexToBytes, bytesToHex, randomBytes} from '@noble/hashes/utils'
  import {
    generateSecretKey,
    type VerifiedEvent,
    type NostrEvent,
    getPublicKey
  } from '@nostr/tools/pure'
  import {type SubCloser} from '@nostr/tools/pool'
  import {
    BunkerSigner,
    type BunkerSignerParams,
    parseBunkerInput,
    type BunkerPointer,
    BUNKER_REGEX,
    type ClientMetadata
  } from '@nostr/tools/nip46'
  import {NIP05_REGEX} from '@nostr/tools/nip05'
  import {npubEncode, nsecEncode} from '@nostr/tools/nip19'
  import {onMount} from 'svelte'
  import type {Signer} from './signer'
  import {createNostrConnectURI} from '@nostr/tools/nip46'
  import mediaQueryStore from './mediaQueryStore'
  import Spinner from './Spinner.svelte'
  import {loadRelayList} from '@nostr/gadgets/lists'
  import createNsecSigner from './nsecSigner'
  import {belongsToDomain} from './utils'
  import {
    POMEGRANATE_CENTRAL_URL,
    pomegranateRegister,
    setupPomegranateProfile,
    searchForActualCentralURLAnnounced,
    setCentralUrl
  } from './pomegranate'

  const mobileMode = mediaQueryStore('only screen and (max-width: 640px)')
  const lskeys = {
    ORIGIN: 'wnj:origin',
    CLIENT_SECRET: 'wnj:clientSecret',
    Y_POS: 'wnj:ypos',
    CALLBACK_TOKEN: 'wnj:callbackToken',
    BUNKER_POINTER: 'wnj:bunkerPointer'
  }

  let myself: HTMLDivElement
  export let accent: string
  export let position: 'top' | 'bottom' = 'top'
  $: origin = $mobileMode
    ? 'bottom'
    : (localStorage.getItem(lskeys.ORIGIN) as 'top' | 'bottom' | null) ||
      position
  export let startHidden: boolean
  export let compactMode: boolean
  export let relays: string[]
  export let appMetadata: ClientMetadata

  const win = window as any
  let bunkerInput: HTMLInputElement
  let bunkerInputValue: string
  let clientSecret: Uint8Array
  const local = localStorage.getItem(lskeys.CLIENT_SECRET)
  if (local) {
    clientSecret = hexToBytes(local)
  } else {
    clientSecret = generateSecretKey()
    localStorage.setItem(lskeys.CLIENT_SECRET, bytesToHex(clientSecret))
  }

  let state: 'opened' | 'closed' | 'justopened' | 'justclosed' = 'closed'
  let nostrLogin = false
  let bunkerPointer: BunkerPointer | null
  let resolveBunker: (_: BunkerSigner) => void
  let rejectBunker: (_: string) => void
  let plainkey = false
  let signer: Promise<Signer>
  let connecting: boolean
  let connected: boolean
  let showAuth: string | null = null
  let showLogin: string | null = null
  let showConfirmAction: string | null = null
  let takingTooLong = false
  let hasTriedToConnectButFailed = false
  let creating: boolean
  let errorMessage: string
  let showInfo = false
  let identity: null | {
    pubkey: string
    npub: string
    name?: string
    picture?: string
    event: NostrEvent | null
  }
  let metadataSub: SubCloser | null
  let pendingRejections: ((reason?: any) => void)[] = []
  type PendingCall =
    | {
        kind: 'getPublicKey'
        resolve: (value: string) => void
        reject: (reason?: any) => void
      }
    | {
        kind: 'signEvent'
        event: NostrEvent
        resolve: (value: VerifiedEvent) => void
        reject: (reason?: any) => void
      }
  let pendingCalls: PendingCall[] = []

  function removePendingRejection(reject: (reason?: any) => void) {
    const idx = pendingRejections.indexOf(reject)
    if (idx !== -1) {
      pendingRejections.splice(idx, 1)
    }
  }

  function enqueueCall(call: PendingCall) {
    pendingCalls.push(call)
    pendingRejections.push(call.reject)
    if (!connecting && !connected) connectOrOpen()
  }

  async function flushPendingCalls() {
    if (!connected || pendingCalls.length === 0) return
    const calls = pendingCalls.splice(0)
    for (const call of calls) {
      try {
        if (call.kind === 'getPublicKey') {
          call.resolve(await (await signer).getPublicKey())
        } else {
          call.resolve(await (await signer).signEvent(call.event))
          showConfirmAction = null
          close()
        }
      } catch (error) {
        call.reject(error)
      } finally {
        removePendingRejection(call.reject)
      }
    }
  }

  // QR code related state
  let qrCodeDataUrl: Promise<string>
  let nostrConnectURI: string | undefined
  let nostrConnectAbort: AbortController
  let isCopied = false
  let nsecCopied = false

  async function copyNostrConnectUri() {
    if (nostrConnectURI) {
      await navigator.clipboard.writeText(nostrConnectURI)
      isCopied = true
      setTimeout(() => {
        isCopied = false
      }, 700)
    }
  }

  async function copyNsec() {
    if (bunkerInputValue) {
      await navigator.clipboard.writeText(bunkerInputValue)
      nsecCopied = true
      setTimeout(() => {
        nsecCopied = false
      }, 700)
    }
  }

  const connectBunkerError =
    'We could not connect to a NIP-46 bunker with that url, are you sure it is set up correctly?'
  const connectNip05Error =
    'We were not able to connect using this address. For it to work it has to come from a NIP-46 provider.'

  const BASE_YPOS = 20
  export let right = 20
  $: ypos = $mobileMode
    ? BASE_YPOS
    : parseInt(localStorage.getItem(lskeys.Y_POS) || '0') || BASE_YPOS
  let dragStarted = false
  let hasMoved = false
  let insidePosition: number
  let yposStart: number
  let clickStart: number

  $: opened = state === 'justopened' || state === 'opened'
  $: movingStyle = hasMoved
    ? 'cursor-grabbing outline-dashed outline-' +
      accent +
      '-500 outline-1 outline-offset-4'
    : 'outline-none'

  $: bunkerInputValueIsGood =
    bunkerInputValue &&
    (bunkerInputValue.match(BUNKER_REGEX) ||
      bunkerInputValue.match(NIP05_REGEX) ||
      (bunkerInputValue.startsWith('nsec1') && bunkerInputValue.length === 63))

  const bunkerSignerParams: BunkerSignerParams = {
    pool,
    onauth(url: string) {
      if (creating) {
        showAuth = url
      } else if (identity) {
        showConfirmAction = url
        state = 'opened'
      } else {
        showLogin = url
      }
    }
  }

  function openAuthURLPopup(url: string | null): Window | null {
    return window.open(url!, 'window.nostr', `width=600,height=800,popup=yes`)
  }

  const delayedUpdateState = debounce(() => {
    switch (state) {
      case 'justopened':
        state = 'opened'
        break
      case 'justclosed':
        state = 'closed'
        break
    }
  }, 500)

  async function open() {
    state = 'justopened'
    delayedUpdateState()

    // nostrconnect:// QR code
    const clientPubkey = getPublicKey(clientSecret)
    nostrConnectURI = createNostrConnectURI({
      clientPubkey,
      secret: bytesToHex(randomBytes(8)),
      relays,
      name: appMetadata.name || location.hostname,
      url:
        (appMetadata.url && belongsToDomain(appMetadata.url, location)
          ? appMetadata.url
          : undefined) || location.href.split('#')[0].split('?')[0],
      image:
        appMetadata.image ||
        (
          document.head.querySelector('link[rel~="icon"]') as
            | HTMLLinkElement
            | undefined
        )?.href ||
        location.origin + '/favicon.ico'
    })
    qrCodeDataUrl = QRCode.toDataURL(nostrConnectURI.toString(), {
      width: 256,
      margin: 2,
      color: {dark: '#000000', light: '#FFFFFF'}
    })

    nostrConnectAbort = new AbortController()

    try {
      const bunker = await BunkerSigner.fromURI(
        clientSecret,
        nostrConnectURI,
        bunkerSignerParams,
        nostrConnectAbort.signal
      )
      bunkerPointer = bunker.bp
      localStorage.setItem(lskeys.BUNKER_POINTER, JSON.stringify(bunkerPointer))
      nostrLogin = true
      connected = true
      resolveBunker(bunker)
      await flushPendingCalls()
      await identify()
      close()
    } catch (err) {
      console.warn('nostrconnect:// QR code handling failed:', err)
    } finally {
      nostrConnectAbort.abort('window.nostr.js interaction finished')
    }
  }

  function close() {
    state = 'justclosed'
    delayedUpdateState()

    nostrConnectAbort?.abort?.('window.nostr.js widget closed')
  }

  function connectOrOpen() {
    if (bunkerPointer && !connected) {
      connect()
      return
    }
    open()
  }

  reset()

  let windowNostr = {
    isWnj: true,
    async getPublicKey(): Promise<string> {
      return new Promise<string>(async (resolve, reject) => {
        if (!connected) {
          enqueueCall({kind: 'getPublicKey', resolve, reject})
          return
        }

        pendingRejections.push(reject)
        try {
          const result = await (await signer).getPublicKey()
          resolve(result)
        } catch (error) {
          reject(error)
        } finally {
          removePendingRejection(reject)
        }
      })
    },
    async signEvent(event: NostrEvent): Promise<VerifiedEvent> {
      if (!connected) {
        return new Promise<VerifiedEvent>((resolve, reject) => {
          enqueueCall({kind: 'signEvent', event, resolve, reject})
        })
      }

      try {
        return await (await signer).signEvent(event)
      } finally {
        showConfirmAction = null
        close()
      }
    },
    async getRelays(): Promise<{
      [url: string]: {read: boolean; write: boolean}
    }> {
      return {}
    },
    nip04: {
      async encrypt(pubkey: string, plaintext: string): Promise<string> {
        if (!connecting && !connected) connectOrOpen()
        return (await signer).nip04Encrypt(pubkey, plaintext)
      },
      async decrypt(pubkey: string, ciphertext: string): Promise<string> {
        if (!connecting && !connected) connectOrOpen()
        return (await signer).nip04Decrypt(pubkey, ciphertext)
      }
    },
    nip44: {
      async encrypt(pubkey: string, plaintext: string): Promise<string> {
        if (!connecting && !connected) connectOrOpen()
        return (await signer).nip44Encrypt(pubkey, plaintext)
      },
      async decrypt(pubkey: string, ciphertext: string): Promise<string> {
        if (!connecting && !connected) connectOrOpen()
        return (await signer).nip44Decrypt(pubkey, ciphertext)
      }
    }
  }

  function reset() {
    close()
    bunkerPointer = null
    signer = new Promise((resolve, reject) => {
      resolveBunker = resolve
      rejectBunker = reject
    })
    identity = null
    connecting = false
    takingTooLong = false
    creating = false
    connected = false
    metadataSub = null
    errorMessage = ''
    nostrConnectURI = undefined
  }

  onMount(() => {
    // Check if hash contains "nostr-login"
    const hash = window.location.hash
    if (hash.startsWith('#nostr-login=')) {
      // Extract the value after "nostr-login="
      const value = hash.substring(hash.indexOf('=') + 1)

      // Reset nostr-login data
      const urlWithoutHash = window.location.href.split('#')[0]
      history.replaceState(null, '', urlWithoutHash)

      if (value.startsWith('bunker://')) {
        bunkerInputValue = value
        nostrLogin = true
        if (!startHidden) open()
        handleConnect()
      } else if (value.startsWith('nsec1')) {
        bunkerInputValue = value
        nostrLogin = true
        if (!startHidden) open()
        handleNsec()
      }
    }

    if (!bunkerPointer) {
      let data = localStorage.getItem(lskeys.BUNKER_POINTER)
      if (data) {
        if (data.startsWith('nsec1')) {
          bunkerInputValue = data
          handleNsec()
          identify()
        } else {
          bunkerPointer = JSON.parse(data) as BunkerPointer

          // rebuild a bunker url from the pointer data so we can fill in the input
          let bunkerURL = new URL(`bunker://${bunkerPointer.pubkey}`)
          bunkerPointer.relays.forEach(relay => {
            bunkerURL.searchParams.append('relay', relay)
          })
          if (bunkerPointer.secret) {
            bunkerURL.searchParams.set('secret', bunkerPointer.secret)
          }
          bunkerInputValue = bunkerURL.toString()
          // ~

          identify()

          // we must connect here so identify() works because we can't rely on the bunker params to read our pubkey
          connect()
        }
      }
    }

    if (win.nostr && !win.nostr.isWnj) {
      // there is already a window.nostr
      // (and it is not our own from a previous development hmr)
      // so we just vanish
      win.destroyWnj()
      return
    } else {
      // there is no window.nostr, so we set this
      // if an extension shows up later and sets this on top of ours we will vanish
      Object.defineProperty(window, 'nostr', {
        get: function () {
          return windowNostr
        },
        set: function (v) {
          // when some extension tries to set this property we replace the internal object we have
          windowNostr = v

          // this is being set by an extension, so we vanish
          if (!v.isWnj) win.destroyWnj()

          // reject all pending operations with a specific error
          pendingRejections.forEach(reject => {
            reject(
              new Error('Nostr extension took over, please retry the operation')
            )
          })
          pendingRejections = []
          pendingCalls = []
        },
        configurable: true // this allows Object.defineProperty() to be called again
      })
    }

    return () => {
      if (metadataSub) metadataSub.close()
    }
  })

  function handleClick(ev: MouseEvent) {
    if (Math.abs(ypos - yposStart) > 6 || Date.now() - clickStart > 600) {
      return
    }

    if (state === 'justopened' || state === 'justclosed') return

    if (ev.composedPath().find((el: any) => el.id === 'wnj')) open()
    else close()
  }

  function handleCloseModal(ev: MouseEvent) {
    close()
    creating = false
    showAuth = null
    showLogin = null
    showConfirmAction = null
    ev.stopPropagation()
  }

  function handleShowInfo(ev: MouseEvent) {
    showInfo = true
    ev.stopPropagation()
  }

  function handleCloseInfo(ev: MouseEvent) {
    showInfo = false
    ev.stopPropagation()
  }

  async function handleConnect(ev?: SubmitEvent) {
    ev?.preventDefault?.()
    plainkey = false

    try {
      bunkerPointer = await parseBunkerInput(bunkerInputValue)
      if (!bunkerPointer) {
        if (bunkerInputValue.match(BUNKER_REGEX)) {
          errorMessage = connectBunkerError
        } else {
          errorMessage = connectNip05Error
        }
        return
      }

      bunkerInput.setCustomValidity('')
      errorMessage = ''
      await connect()

      // since we are connecting right now after the user has typed stuff
      // wait until the connection has succeeded before loading user data
      identify()
    } catch (error) {
      if (bunkerInputValue.match(BUNKER_REGEX)) {
        errorMessage = connectBunkerError
      } else {
        errorMessage = connectNip05Error
      }
      connecting = false
    }
  }

  async function handleNsec(ev?: SubmitEvent) {
    ev?.preventDefault?.()

    try {
      plainkey = true
      signer = Promise.resolve(createNsecSigner(bunkerInputValue))

      nostrLogin = true
      if (!startHidden) open()
      errorMessage = ''
      connecting = false
      connected = true
      await flushPendingCalls()
      identify()
      localStorage.setItem(lskeys.BUNKER_POINTER, bunkerInputValue)
    } catch (error) {
      console.error('failed to decode nsec:', error)
    }
  }

  async function handleDisconnect(ev: MouseEvent) {
    ev.preventDefault()
    localStorage.removeItem(lskeys.BUNKER_POINTER)
    reset()
  }

  async function handleErasePointer(ev: MouseEvent) {
    ev.preventDefault()
    bunkerInputValue = ''
    localStorage.removeItem(lskeys.BUNKER_POINTER)
    hasTriedToConnectButFailed = false
  }

  function handleOpenLogin(_: MouseEvent) {
    creating = false
  }

  function handleAbortConnection() {
    takingTooLong = false
    connecting = false
    rejectBunker('connection aborted')
    reset()
    open()
  }

  async function connect(b: BunkerSigner | undefined = undefined) {
    b =
      b ||
      BunkerSigner.fromBunker(clientSecret, bunkerPointer!, bunkerSignerParams)
    connecting = true

    let connectionTimeout = setTimeout(() => {
      takingTooLong = true
      state = 'opened'
    }, 5000)

    try {
      await b.connect()
      connected = true
      close()

      // every now and then try to update the relays
      if (Date.now() % 20 === 0) {
        await b.switchRelays()
      }

      localStorage.setItem(lskeys.BUNKER_POINTER, JSON.stringify(bunkerPointer))
      resolveBunker(b)
      await flushPendingCalls()
    } catch (err: any) {
      rejectBunker(err?.message || String(err))
    } finally {
      // this still gets executed even if we return above
      clearTimeout(connectionTimeout)
      connecting = false
      takingTooLong = false
      showAuth = null
      showLogin = null
      showConfirmAction = null
      if (nostrLogin && !startHidden) {
        open()
      }
    }
  }

  // identify() is what gives a name and picture to our floating widget
  async function identify() {
    let pubkey: string
    try {
      pubkey = await (await signer).getPublicKey()
    } catch (err) {
      hasTriedToConnectButFailed = true
      return
    }

    identity = {
      pubkey: pubkey,
      npub: npubEncode(pubkey),
      event: null
    }

    const rl = await loadRelayList(pubkey)

    metadataSub = pool.subscribeMany(
      rl.items
        .filter(r => r.write)
        .map(r => r.url)
        .concat([
          'wss://purplepag.es',
          'wss://indexer.coracle.social',
          'wss://relay.snort.social',
          'wss://relay.nos.social'
        ]),
      {kinds: [0], authors: [pubkey]},
      {
        onevent(evt) {
          if ((identity!.event?.created_at || 0) >= evt.created_at) return
          try {
            let {name, picture} = JSON.parse(evt.content)
            identity!.event = evt
            identity!.name = name
            identity!.picture = picture
          } catch (err) {
            /***/
          }
        }
      }
    )
  }

  function handleMouseDown(ev: MouseEvent) {
    if (opened) return
    dragStarted = true
    const rect = myself.getBoundingClientRect()
    insidePosition = ev.clientY - rect.top
    yposStart = ypos
    clickStart = Date.now()
  }

  function handleMouseMove(ev: MouseEvent) {
    if (!dragStarted) return

    if (origin === 'top') {
      ypos = ev.clientY
    } else {
      ypos = window.innerHeight - ev.clientY
    }
    ypos -= insidePosition

    hasMoved = true

    // do not let the widget go outside the view
    if (ypos < BASE_YPOS) {
      ypos = BASE_YPOS
    }
    if (ypos > window.innerHeight - BASE_YPOS) {
      ypos = window.innerHeight - BASE_YPOS
    }
  }

  function handleMouseUp() {
    dragStarted = false

    setTimeout(() => {
      hasMoved = false
    }, 10)

    if (hasMoved) {
      const rect = myself.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const viewportMidpoint = viewportHeight / 2
      if (rect.top < viewportMidpoint) {
        origin = 'top'
        ypos = rect.top
      } else {
        origin = 'bottom'
        ypos = viewportHeight - rect.bottom
      }

      if (ypos < BASE_YPOS) {
        ypos = BASE_YPOS
      }

      localStorage.setItem(lskeys.ORIGIN, origin)
      localStorage.setItem(lskeys.Y_POS, ypos.toString())
    }
  }

  function handleGenerateIdentity() {
    const sk = generateSecretKey()
    bunkerInputValue = nsecEncode(sk)
    handleNsec()
  }

  async function handleLoginGoogle() {
    const popup = window.open(
      `${POMEGRANATE_CENTRAL_URL}/login/google`,
      'Pomegranate Google OAuth',
      'width=600,height=600'
    )
    if (!popup) {
      errorMessage = 'Popup blocked. Allow popups for this site.'
      return
    }

    connecting = true
    errorMessage = ''

    const token = await new Promise<string>(resolve => {
      function handler(event: MessageEvent) {
        if (event.origin !== POMEGRANATE_CENTRAL_URL || !event.data?.token)
          return
        window.removeEventListener('message', handler)
        popup!.close()
        resolve(event.data.token)
      }
      window.addEventListener('message', handler)
    })

    const evt = JSON.parse(atob(token))
    const email =
      evt.tags?.find((tag: string[]) => tag[0] === 'email')?.[1] || ''

    let accountResp = await fetch(`${POMEGRANATE_CENTRAL_URL}/account`, {
      headers: {Authorization: `Token ${token}`}
    })

    if (accountResp.status === 404) {
      const actualCentral = await searchForActualCentralURLAnnounced(email)
      if (actualCentral && actualCentral !== POMEGRANATE_CENTRAL_URL) {
        setCentralUrl(actualCentral)
        connecting = false
        errorMessage = 'Account found, click again'
        return
      }

      try {
        await pomegranateRegister(token, email)
      } catch (err: any) {
        errorMessage = err.message
        connecting = false
        return
      }

      accountResp = await fetch(`${POMEGRANATE_CENTRAL_URL}/account`, {
        headers: {Authorization: `Token ${token}`}
      })
    }

    if (!accountResp.ok) {
      errorMessage = 'Account setup failed'
      connecting = false
      return
    }

    try {
      bunkerInputValue = await setupPomegranateProfile(token)
    } catch (err: any) {
      errorMessage = err.message
      connecting = false
      return
    }

    creating = false
    await handleConnect()
  }
</script>

<svelte:window
  on:click={handleClick}
  on:mouseup={handleMouseUp}
  on:mousemove={handleMouseMove}
/>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="draggable z-[9000] animate-fadein font-sans text-white"
  class:cursor-pointer={!identity && !opened}
  style="position: fixed; {opened && $mobileMode
    ? 'width: 100vw;'
    : ''}; right: {opened && $mobileMode
    ? '0'
    : right}px; user-select: none; {opened && $mobileMode
    ? 'bottom: 0px'
    : origin + ':' + ypos + 'px'}"
  on:mousedown={handleMouseDown}
  bind:this={myself}
>
  <!-- Close status ################### -->
  {#if !opened && !identity && startHidden}
    <!-- Show nothing  -->
  {:else if !opened}
    <div
      class="rounded px-2 py-2 shadow-[0_0px_10px_0px_rgba(0,0,0,0.3)] transition-all duration-200 bg-{accent}-700 hover:bg-{accent}-800 {movingStyle}"
    >
      <!-- Connecting view ################### -->
      {#if connecting}
        <div class="flex items-center px-2">
          Connecting to bunker
          <Spinner />
        </div>
      {:else if !identity}
        {#if compactMode}
          <div class="w-6 text-center">N</div>
        {:else}
          <div class="flex items-center px-2">Connect with Nostr</div>
        {/if}
      {:else if !compactMode}
        <div class="flex items-center px-2">
          {#if identity.picture}
            <img
              src={identity.picture}
              alt=""
              class="mr-2 h-5 w-5 rounded-full"
            />
          {:else}
            <span class="mr-2">☉</span>
          {/if}
          <div
            class="inline-block max-w-56 overflow-hidden overflow-ellipsis whitespace-nowrap"
          >
            {identity.name ||
              identity.npub.slice(0, 7) + '…' + identity.npub.slice(-4)}
          </div>
        </div>
      {:else}
        <img src={identity.picture} alt="" class="h-6 w-6 rounded-full" />
      {/if}
    </div>

    <!-- Open status ################### -->
  {:else}
    <div
      class="animate-show rounded-md bg-gradient-to-b px-8 py-8 shadow-[0_0px_30px_0px_rgba(0,0,0,0.6)] transition-all sm:w-96 bg-{accent}-800 from-{accent}-900 to-{accent}-700 {movingStyle}"
    >
      <button
        on:click={showInfo ? handleCloseInfo : handleCloseModal}
        class="absolute right-2 top-0 cursor-pointer bg-transparent text-3xl text-{accent}-600"
        >⤫</button
      >

      {#if !showInfo && !showAuth && !showLogin && !showConfirmAction}
        <button
          on:click={handleShowInfo}
          class="absolute bottom-1 right-3 cursor-pointer bg-transparent text-xl text-{accent}-600"
          >?</button
        >
      {/if}

      {#if showAuth}
        <div class="m-auto w-full">
          <div class="text-center text-lg">Create a Nostr account</div>
          <div class="mt-4 text-center text-sm leading-4">
            A new window will now open, taking you to
            <strong>{new URL(showAuth).host}</strong>
            where the account creation will occur. If nothing happens, ensure your
            browser is not blocking popups.
            <br /> Afterward, you'll be redirected back to this page.
          </div>
          <button
            class="mt-4 block w-full cursor-pointer rounded border-0 px-2 py-1 text-lg text-white disabled:cursor-default disabled:bg-neutral-400 disabled:text-neutral-200 bg-{accent}-900 hover:bg-{accent}-950"
            on:click={() => openAuthURLPopup(showAuth)}
          >
            Start account creation »
          </button>
        </div>
      {:else if showLogin}
        <div class="m-auto w-full">
          <div class="text-center text-lg">Login into a Nostr account</div>
          <div class="mt-4 text-center text-sm leading-4">
            A new window will now open, taking you to <strong
              >{new URL(showLogin).host}</strong
            >
            where you can login and approve the permissions. If nothing happens, ensure
            your browser is not blocking popups. <br />
            Afterward, you'll be redirected back to this page.
          </div>
          <button
            class="mt-4 block w-full cursor-pointer rounded border-0 px-2 py-1 text-lg text-white disabled:cursor-default disabled:bg-neutral-400 disabled:text-neutral-200 bg-{accent}-900 hover:bg-{accent}-950"
            on:click={() => openAuthURLPopup(showLogin)}
          >
            Login now »
          </button>
        </div>
      {:else if showConfirmAction}
        <div class="m-auto w-full">
          <div class="text-center text-lg">
            An action requires your confirmation
          </div>
          <div class="mt-4 text-center text-sm leading-4">
            A new window will now open, taking you to <strong
              >{new URL(showConfirmAction).host}</strong
            >
            where you can approve the current action. If nothing happens, ensure your
            browser is not blocking popups.<br />
            Afterward, you'll be redirected back to this page.
          </div>
          <button
            class="mt-4 block w-full cursor-pointer rounded border-0 px-2 py-1 text-lg text-white disabled:cursor-default disabled:bg-neutral-400 disabled:text-neutral-200 bg-{accent}-900 hover:bg-{accent}-950"
            on:click={() => {
              openAuthURLPopup(showConfirmAction)
            }}
          >
            Confirm action »
          </button>
        </div>

        <!-- Show info ################### -->
      {:else if showInfo}
        <div class="text-center text-lg">What is that?</div>
        <div class="text-base leading-5">
          <p class="mb mt-4">
            This widget is created with <i>window.nostr.js</i>, a small script
            you can drop in any page that already uses NIP-07 and make it also
            work with NIP-46 automatically when the user doesn't have an
            extension installed.
            <br />
            It adds a small floating button on the side of the window that users can
            use to create Nostr accuonts or connect to their NIP-46 bunkers.
          </p>
          <p class="mt-4">
            This tool is opensource, get the code from the <a
              target="_blank"
              class="underline"
              href="https://github.com/fiatjaf/window.nostr.js"
              >project's page</a
            >.
          </p>
          <p class="mt-4">
            You don't know what Nostr is?
            <a target="_blank" class="underline" href="https://www.nostr.com"
              >Learn more</a
            >.
          </p>
        </div>

        <!-- Create account view ################### -->
      {:else if creating}
        <div class="text-center text-lg">Login to Nostr</div>
        <div class="mt-4 text-base leading-5">
          Login with Google to create and manage a secure cloud-based keypair,
          or generate a local private key you control yourself.
        </div>
        <button
          class="mt-4 block w-full cursor-pointer rounded border-0 px-2 py-1 text-lg text-white disabled:cursor-default disabled:bg-neutral-400 disabled:text-neutral-200 bg-{accent}-900 hover:bg-{accent}-950"
          on:click={() => {
            creating = false
            handleLoginGoogle()
          }}
          >Login with Google »
        </button>
        <button
          class="mt-2 block w-full cursor-pointer rounded border-0 px-2 py-1 text-lg text-white disabled:cursor-default disabled:bg-neutral-400 disabled:text-neutral-200 bg-{accent}-900 hover:bg-{accent}-950"
          on:click={handleGenerateIdentity}
          >Generate new identity
        </button>
        <div class="mt-6 text-center text-sm leading-3">
          Do you already have a Nostr address?<br />
          <button
            class="cursor-pointer border-0 bg-transparent text-sm text-white underline"
            on:click={handleOpenLogin}>Login now</button
          >
        </div>

        <!-- Login view ################### -->
      {:else if !identity}
        <div class="text-center text-lg">
          How do you want to connect to Nostr?
        </div>

        <!-- Manual Input View -->
        <form
          class="mb-1 mt-4 flex flex-col"
          on:submit={ev =>
            bunkerInputValue.startsWith('nsec1')
              ? handleNsec(ev)
              : handleConnect(ev)}
        >
          <!-- svelte-ignore a11y-autofocus -->
          <input
            class="box-border w-full rounded px-2 py-1 text-lg text-neutral-800 outline-none"
            placeholder="bunker://... or nsec1..."
            bind:this={bunkerInput}
            bind:value={bunkerInputValue}
            autofocus
            disabled={connecting}
            autocapitalize="none"
          />
          {#if errorMessage}
            <div
              class="my-2 rounded bg-yellow-100 p-2 text-center text-sm leading-4 text-red-400"
            >
              {errorMessage}
            </div>
          {/if}
          <button
            class="mt-4 flex w-full cursor-pointer items-center justify-center rounded border-0 px-2 py-1 text-lg text-white disabled:cursor-default disabled:bg-neutral-400 disabled:text-neutral-200 bg-{accent}-900 hover:bg-{accent}-950"
            disabled={!bunkerInputValueIsGood || connecting}
          >
            {#if connecting}
              Connecting to bunker
              <Spinner />
            {:else}
              Connect »
            {/if}
          </button>
          {#if connecting && takingTooLong}
            <div class="mt-6 text-center text-sm leading-3">
              Waiting too much?
              <button
                class="cursor-pointer border-0 bg-transparent text-sm text-white underline"
                on:click={handleAbortConnection}>Cancel the connection</button
              >
            </div>
          {/if}
        </form>

        {#if !connecting}
          <div class="mt-6 text-center text-sm leading-3">
            {#if hasTriedToConnectButFailed}
              Is this bunker provider broken?<br />
              <button
                class="cursor-pointer border-0 bg-transparent text-sm text-white underline"
                on:click={handleErasePointer}>Clear it</button
              >
            {:else}
              No account yet?<br />
              <button
                class="cursor-pointer border-0 bg-transparent text-sm text-white underline"
                on:click={handleLoginGoogle}>Login with Google</button
              >
              <span class="px-1">·</span>
              <button
                class="cursor-pointer border-0 bg-transparent text-sm text-white underline"
                on:click={handleGenerateIdentity}>Generate identity</button
              >
            {/if}
          </div>
        {/if}

        <!-- QR Code View -->
        {#if !connecting}
          <div class="mt-4 text-center">
            <div class="mb-2 text-sm">
              Scan this QR code with a Nostr client to connect
            </div>

            {#if nostrConnectURI}
              <div class="mb-4 flex justify-center">
                {#await qrCodeDataUrl}
                  <Spinner />
                {:then qrCodeDataUrl}
                  <div
                    class="cursor-pointer"
                    on:click={copyNostrConnectUri}
                    on:keydown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        copyNostrConnectUri()
                      }
                    }}
                  >
                    <img
                      src={qrCodeDataUrl}
                      alt="Nostr Connect QR Code"
                      class="rounded-lg bg-white p-2"
                    />
                  </div>
                {:catch err}
                  <p>{err}</p>
                {/await}
              </div>
              {#if isCopied}
                <div class="mb-38 mt-34 break-all text-xs text-gray-300">
                  Copied!
                </div>
              {:else}
                <div
                  class="mb-4 cursor-pointer break-all text-xs text-gray-300 transition-all hover:text-gray-200"
                  on:click={copyNostrConnectUri}
                  on:keydown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      copyNostrConnectUri()
                    }
                  }}
                  role="button"
                  tabindex="0"
                  title="Click to copy"
                >
                  {nostrConnectURI}
                  <svg
                    class="ml-1 inline-block h-3 w-3 align-middle"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              {/if}
            {:else}
              <div class="mb-4 flex justify-center">
                <Spinner />
              </div>
            {/if}
          </div>
        {/if}

        <!-- Connected view ################### -->
      {:else}
        <div class="text-center">
          <div class="mb-4 text-sm">You are connected to Nostr as</div>
          <a
            target="_blank"
            href={'https://njump.me/' + identity.npub}
            class="group text-white no-underline"
          >
            {#if identity.picture || identity.name}
              <div class="mb-2 flex items-center justify-center gap-2">
                {#if identity.picture}
                  <img
                    src={identity.picture}
                    alt=""
                    class="h-10 w-10 rounded-full border-2 border-solid border-transparent group-hover:border-{accent}-100"
                  />
                {/if}
                {#if identity.name}
                  <div
                    class="text-3xl decoration-2 underline-offset-4 group-hover:underline"
                  >
                    {identity.name}
                  </div>
                {/if}
              </div>
            {/if}
            <div class="block break-all">{identity.npub}</div>
          </a>
        </div>
        <button
          class="my-2 mt-6 block w-full cursor-pointer rounded border-0 px-2 py-1 text-lg text-white bg-{accent}-900 hover:bg-{accent}-950"
          on:click={handleDisconnect}>Disconnect</button
        >
        {#if !plainkey}
          <div class="mt-6 block break-all text-center text-xs">
            This webpage is using the public key:<br />
            {getPublicKey(clientSecret)}
          </div>
        {:else if nsecCopied}
          <div class="mt-6 block cursor-pointer break-all text-center text-xs">
            Copied
          </div>
        {:else}
          <div
            class="mt-6 block cursor-pointer break-all text-center text-xs"
            on:click={copyNsec}
            role="button"
            tabindex="0"
            on:keydown={e => e.key === 'Enter' && copyNsec()}
          >
            Export secret key to clipboard
            <svg
              class="ml-1 inline-block h-3 w-3 align-baseline"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 52 52"
              enable-background="new 0 0 52 52"
            >
              <path
                d="M17.4,11.6h17.3c0.9,0,1.6-0.7,1.6-1.6V6.8c0-2.6-2.1-4.8-4.7-4.8h-11c-2.6,0-4.7,2.2-4.7,4.8V10 C15.8,10.9,16.5,11.6,17.4,11.6z"
              />
              <path
                d="M43.3,6h-1.6c-0.5,0-0.8,0.3-0.8,0.8V10c0,3.5-2.8,6.4-6.3,6.4H17.4c-3.5,0-6.3-2.9-6.3-6.4V6.8 c0-0.5-0.3-0.8-0.8-0.8H8.7C6.1,6,4,8.2,4,10.8v34.4C4,47.8,6.1,50,8.7,50h34.6c2.6,0,4.7-2.2,4.7-4.8V10.8C48,8.2,45.9,6,43.3,6z"
              />
            </svg>
            <br />
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>
