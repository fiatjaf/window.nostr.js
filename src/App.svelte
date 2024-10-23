<script lang="ts">
  import debounce from 'debounce'
  import {hexToBytes, bytesToHex} from '@noble/hashes/utils'
  import {
    generateSecretKey,
    type VerifiedEvent,
    type NostrEvent,
    getPublicKey
  } from 'nostr-tools/pure'
  import {SimplePool, type SubCloser} from 'nostr-tools/pool'
  import {
    BunkerSigner,
    type BunkerSignerParams,
    createAccount,
    parseBunkerInput,
    fetchBunkerProviders,
    type BunkerPointer,
    type BunkerProfile,
    BUNKER_REGEX
  } from 'nostr-tools/nip46'
  import {NIP05_REGEX, queryProfile} from 'nostr-tools/nip05'
  import {npubEncode} from 'nostr-tools/nip19'
  import {onMount} from 'svelte'
  import mediaQueryStore from './mediaQueryStore.js'
  import Spinner from './Spinner.svelte'

  const mobileMode = mediaQueryStore('only screen and (max-width: 640px)')
  const localStorageKeys = {
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
    : (localStorage.getItem(localStorageKeys.ORIGIN) as
        | 'top'
        | 'bottom'
        | null) || position
  export let startHidden: boolean
  export let compactMode: boolean

  const win = window as any
  const pool = new SimplePool()
  let bunkerInput: HTMLInputElement
  let bunkerInputValue: string
  let nameInput: HTMLInputElement
  let nameInputValue: string
  let chosenProvider: BunkerProfile | undefined
  let clientSecret: Uint8Array
  const local = localStorage.getItem(localStorageKeys.CLIENT_SECRET)
  if (local) {
    clientSecret = hexToBytes(local)
  } else {
    clientSecret = generateSecretKey()
    localStorage.setItem(
      localStorageKeys.CLIENT_SECRET,
      bytesToHex(clientSecret)
    )
  }

  let state: 'opened' | 'closed' | 'justopened' | 'justclosed' = 'closed'
  let bunkerPointer: BunkerPointer | null
  let resolveBunker: (_: BunkerSigner) => void
  let rejectBunker: (_: string) => void
  let bunker: Promise<BunkerSigner>
  let connecting: boolean
  let connected: boolean
  let showAuth: string | null = null
  let showLogin: string | null = null
  let showConfirmAction: string | null = null
  let takingTooLong = false
  let creating: boolean
  let awaitingCreation: boolean
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
  let providers: BunkerProfile[] = []
  const connectBunkerError =
    'We could not connect to a NIP-46 bunker with that url, are you sure it is set up correctly?'
  const connectNip05Error =
    'We were not able to connect using this address. For it to work it has to come from a NIP-46 provider.'

  const BASE_YPOS = 20
  export let right = 20
  $: ypos = $mobileMode
    ? BASE_YPOS
    : parseInt(localStorage.getItem(localStorageKeys.Y_POS) || '0') || BASE_YPOS
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
      bunkerInputValue.match(NIP05_REGEX))

  const bunkerSignerParams: BunkerSignerParams = {
    pool,
    onauth(url: string) {
      if (creating) {
        showAuth = url
      } else if (identity) {
        showConfirmAction = url
        opened = true
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

  function open() {
    state = 'justopened'
    delayedUpdateState()
  }

  function close() {
    state = 'justclosed'
    delayedUpdateState()
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
      if (bunkerPointer) return bunkerPointer.pubkey
      if (!connecting && !connected) open()
      return (await bunker).bp.pubkey
    },
    async signEvent(event: NostrEvent): Promise<VerifiedEvent> {
      try {
        if (!connecting && !connected) connectOrOpen()
        return await (await bunker).signEvent(event)
      } finally {
        showConfirmAction = null
        close()
      }
    },
    async getRelays(): Promise<{
      [url: string]: {read: boolean; write: boolean}
    }> {
      if (!connecting && !connected) connectOrOpen()
      return (await bunker).getRelays()
    },
    nip04: {
      async encrypt(pubkey: string, plaintext: string): Promise<string> {
        if (!connecting && !connected) connectOrOpen()
        return (await bunker).nip04Encrypt(pubkey, plaintext)
      },
      async decrypt(pubkey: string, ciphertext: string): Promise<string> {
        if (!connecting && !connected) connectOrOpen()
        return (await bunker).nip04Decrypt(pubkey, ciphertext)
      }
    }
  }

  function reset() {
    close()
    bunkerPointer = null
    bunker = new Promise((resolve, reject) => {
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
  }

  onMount(() => {
    if (!bunkerPointer) {
      let data = localStorage.getItem(localStorageKeys.BUNKER_POINTER)
      if (data) {
        bunkerPointer = JSON.parse(data)
        // we have a pointer, which means we can get the public key right away
        // but we will only try to connect when any other method is called on window.nostr
        identify()
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
          // replace the internal object we have
          windowNostr = v

          // this is being set by an extension, so we vanish
          if (!v.isWnj) win.destroyWnj()
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

  async function handleConnect(ev: SubmitEvent) {
    ev.preventDefault()
    try {
      bunkerPointer = await parseBunkerInput(bunkerInput.value)
      if (!bunkerPointer) {
        if (bunkerInput.value.match(BUNKER_REGEX)) {
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
      if (bunkerInput.value.match(BUNKER_REGEX)) {
        errorMessage = connectBunkerError
      } else {
        errorMessage = connectNip05Error
      }
      connecting = false
    }
  }

  async function handleDisconnect(ev: MouseEvent) {
    ev.preventDefault()
    localStorage.removeItem(localStorageKeys.BUNKER_POINTER)
    reset()
  }

  async function handleOpenCreate(ev: MouseEvent) {
    ev.preventDefault()
    creating = true
    if (providers.length === 0) {
      providers = await fetchBunkerProviders(pool, [
        'wss://relay.nostr.band',
        'wss://nos.lol',
        'wss://nostr-pub.wellorder.net'
      ])
      chosenProvider = providers[0]
    }
  }

  function handleOpenLogin(_: MouseEvent) {
    creating = false
  }

  async function handleCreate(ev: SubmitEvent) {
    ev.preventDefault()
    if (!chosenProvider) return

    awaitingCreation = true
    let bunker = await createAccount(
      chosenProvider,
      bunkerSignerParams,
      nameInput.value,
      chosenProvider.domain,
      undefined,
      clientSecret
    )
    awaitingCreation = false

    open()
    creating = false

    bunkerPointer = bunker.bp
    identify()
    connect(bunker)
  }

  const checkNameInput = debounce(async () => {
    if (chosenProvider && nameInput.value.length > 0) {
      if (await queryProfile(nameInput.value + '@' + chosenProvider.domain)) {
        nameInput.setCustomValidity(`'${nameInput.value}' is already taken.`)
      } else {
        nameInput.setCustomValidity('')
      }
    }
  }, 500)

  function handleAbortConnection() {
    takingTooLong = false
    connecting = false
    rejectBunker('connection aborted')
    reset()
  }

  async function connect(b: BunkerSigner | undefined = undefined) {
    b = b || new BunkerSigner(clientSecret, bunkerPointer!, bunkerSignerParams)
    connecting = true

    let connectionTimeout = setTimeout(() => {
      takingTooLong = true
      opened = true
    }, 5000)

    try {
      await b.connect()
      connected = true
      localStorage.setItem(
        localStorageKeys.BUNKER_POINTER,
        JSON.stringify(bunkerPointer)
      )
      close()
      resolveBunker(b)
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
    }
  }

  function identify(onFirstMetadata: (() => void) | null = null) {
    let pubkey = bunkerPointer!.pubkey

    identity = {
      pubkey: pubkey,
      npub: npubEncode(pubkey),
      event: null
    }

    metadataSub = pool.subscribeMany(
      [
        'wss://purplepag.es',
        'wss://relay.snort.social',
        'wss://relay.nos.social'
      ],
      [{kinds: [0], authors: [pubkey]}],
      {
        onevent(evt) {
          if ((identity!.event?.created_at || 0) >= evt.created_at) return
          try {
            let {name, picture} = JSON.parse(evt.content)
            identity!.event = evt
            identity!.name = name
            identity!.picture = picture
            onFirstMetadata?.()
            onFirstMetadata = null
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

      localStorage.setItem(localStorageKeys.ORIGIN, origin)
      localStorage.setItem(localStorageKeys.Y_POS, ypos.toString())
    }
  }
</script>

<svelte:window
  on:click={handleClick}
  on:mouseup={handleMouseUp}
  on:mousemove={handleMouseMove}
/>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="draggable animate-fadein font-sans text-white"
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
      class="animate-show rounded-md bg-gradient-to-b px-8 py-8 shadow-[0_0px_30px_0px_rgba(0,0,0,0.6)] transition-all sm:w-96 from-{accent}-900 to-{accent}-700 {movingStyle}"
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
            Now you a new window will bring you to <strong
              >{new URL(showAuth).host}</strong
            >
            where the account creation will take place. If nothing happens check
            that if your browser is blocking popups, pleaase.<br />
            After that you will be returned to this page.
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
            Now you a new window will bring you to <strong
              >{new URL(showLogin).host}</strong
            >
            where you can login and approve the permissions. If nothing happens check
            that if your browser is blocking popups, pleaase.<br />
            After that you will be returned to this page.
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
            Now you a new window will bring you to <strong
              >{new URL(showConfirmAction).host}</strong
            >
            where you can approve the current action. If nothing happens check that
            if your browser is blocking popups, pleaase.<br />
            After that you will be returned to this page.
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
            It adds a small floating button on the side of the window that users
            can use to create Nostr accuonts or connect to their NIP-46 bunkers.
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
        <div class="text-center text-lg">Create a Nostr account</div>
        <form class="mb-1 mt-4" on:submit={handleCreate}>
          <div class="flex flex-row">
            <!-- svelte-ignore a11y-autofocus -->
            <input
              class="box-border w-40 rounded px-2 py-1 text-lg text-neutral-800 outline-none"
              placeholder="bob"
              bind:this={nameInput}
              bind:value={nameInputValue}
              on:input={checkNameInput}
              autofocus
              autocapitalize="none"
            />
            <div class="mx-2 text-2xl">@</div>
            <select
              class="box-border w-full rounded px-2 py-1 text-lg text-neutral-800 outline-none"
              bind:value={chosenProvider}
            >
              {#each providers as prov}
                <option
                  label={prov.domain}
                  value={prov}
                  class="px-2 py-1 text-lg"
                />
              {/each}
            </select>
          </div>
          <button
            class="mt-4 block w-full cursor-pointer rounded border-0 px-2 py-1 text-lg text-white disabled:cursor-default disabled:bg-neutral-400 disabled:text-neutral-200 bg-{accent}-900 hover:bg-{accent}-950"
            disabled={!chosenProvider || !nameInputValue || awaitingCreation}
          >
            Continue »
          </button>
        </form>
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
        <form class="mb-1 mt-4 flex flex-col" on:submit={handleConnect}>
          <!-- svelte-ignore a11y-autofocus -->
          <input
            class="box-border w-full rounded px-2 py-1 text-lg text-neutral-800 outline-none"
            placeholder="user@provider or bunker://..."
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
            Do you need a Nostr account?<br />
            <button
              class="cursor-pointer border-0 bg-transparent text-sm text-white underline"
              on:click={handleOpenCreate}>Sign up now</button
            >
          </div>
        {/if}

        <!-- Connected view ################### -->
      {:else}
        <div class="text-center">
          <div class="mb-4 text-sm">You are connected to Nostr as</div>
          <a
            target="_blank"
            href={'https://nosta.me/' + identity.npub}
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
        <div class="mt-6 block break-all text-center text-sm">
          This webpage is using the public key:<br />
          {getPublicKey(clientSecret)}
        </div>
      {/if}
    </div>
  {/if}
</div>
