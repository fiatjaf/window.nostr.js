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

  let myself: HTMLDivElement
  export let accent: string
  export let position: 'top' | 'bottom' = 'top'
  $: origin = $mobileMode
    ? 'bottom'
    : (localStorage.getItem('wnj:origin') as 'top' | 'bottom' | null) ||
      position

  const win = window as any
  const pool = new SimplePool()
  let bunkerInput: HTMLInputElement
  let bunkerInputValue: string
  let nameInput: HTMLInputElement
  let nameInputValue: string
  let chosenProvider: BunkerProfile | undefined
  let clientSecret: Uint8Array
  const local = localStorage.getItem('wnj:clientSecret')
  if (local) {
    clientSecret = hexToBytes(local)
  } else {
    clientSecret = generateSecretKey()
    localStorage.setItem('wnj:clientSecret', bytesToHex(clientSecret))
  }

  let state: 'opened' | 'closed' | 'justopened' | 'justclosed' = 'closed'
  let bunkerPointer: BunkerPointer | null
  let resolveBunker: (_: BunkerSigner) => void
  let rejectBunker: (_: string) => void
  let bunker: Promise<BunkerSigner>
  let connecting: boolean
  let connected: boolean
  let takingTooLong = false
  let creating: boolean
  let errorMessage: string
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
    : parseInt(localStorage.getItem('wnj:ypos') || '0') || BASE_YPOS
  let dragStarted = false
  let hasMoved = false
  let insidePosition: number
  let yposStart: number
  let clickStart: number

  $: opened = state === 'justopened' || state === 'opened'

  $: movingStyle = hasMoved
    ? 'tw-cursor-grabbing tw-outline-dashed tw-outline-' +
      accent +
      '-500 tw-outline-1 tw-outline-offset-4'
    : 'tw-outline-none'

  $: bunkerInputValueIsGood =
    bunkerInputValue &&
    (bunkerInputValue.match(BUNKER_REGEX) ||
      bunkerInputValue.match(NIP05_REGEX))

  const bunkerSignerParams: BunkerSignerParams = {
    pool,
    onauth(url: string) {
      window.open(url, 'window.nostr', `width=600,height=800,popup=yes`)
    }
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
      if (!connecting && !connected) connectOrOpen()
      return (await bunker).signEvent(event)
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
    let data = localStorage.getItem('wnj:bunkerPointer')
    if (data) {
      bunkerPointer = JSON.parse(data)
      // we have a pointer, which means we can get the public key right away
      // but we will only try to connect when any other method is called on window.nostr

      identify()
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
    localStorage.removeItem('wnj:bunkerPointer')
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

    let bunker = await createAccount(
      chosenProvider,
      bunkerSignerParams,
      nameInput.value,
      chosenProvider.domain
    )

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
      localStorage.setItem('wnj:bunkerPointer', JSON.stringify(bunkerPointer))
      close()
      resolveBunker(b)
    } catch (err: any) {
      rejectBunker(err?.message || String(err))
    } finally {
      // this still gets executed even if we return above
      clearTimeout(connectionTimeout)
      connecting = false
      takingTooLong = false
    }
  }

  function identify() {
    let pubkey = bunkerPointer.pubkey

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

      localStorage.setItem('wnj:origin', origin)
      localStorage.setItem('wnj:ypos', ypos.toString())
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
  class="tw-text-white tw-font-sans draggable tw-animate-fadein"
  class:tw-cursor-pointer={!identity && !opened}
  style="position: fixed; {opened && $mobileMode
    ? 'width: 100%;'
    : ''}; right: {opened && $mobileMode
    ? '0'
    : right}px; user-select: none; {opened && $mobileMode
    ? 'bottom: 0px'
    : origin + ':' + ypos + 'px'}"
  on:mousedown={handleMouseDown}
  bind:this={myself}
>
  <!-- Close status ################### -->
  {#if !opened}
    <div
      class="tw-px-4 tw-py-2 tw-bg-{accent}-700 hover:tw-bg-{accent}-800 tw-rounded tw-shadow-[0_0px_10px_0px_rgba(0,0,0,0.3)] tw-transition-all tw-duration-200 {movingStyle}"
    >
      <!-- Connecting view ################### -->
      {#if connecting}
        <div class="tw-flex tw-items-center">
          Connecting to bunker
          <Spinner />
        </div>
      {:else if !identity}
        Connect with Nostr
      {:else}
        <div class="tw-flex tw-items-center">
          {#if identity.picture}
            <img
              src={identity.picture}
              alt=""
              class="tw-w-5 tw-h-5 tw-rounded-full tw-mr-2"
            />
          {:else}
            ☉
          {/if}
          {identity.name ||
            identity.npub.slice(0, 7) + '…' + identity.npub.slice(-4)}
        </div>
      {/if}
    </div>

    <!-- Open status ################### -->
  {:else}
    <div
      class="sm:tw-w-96 tw-px-6 tw-py-8 tw-bg-{accent}-700 tw-rounded-md tw-shadow-[0_0px_30px_0px_rgba(0,0,0,0.6)] tw-transition-all tw-animate-show {movingStyle}"
    >
      <button
        on:click={handleCloseModal}
        class="tw-absolute tw-top-0 tw-right-2 tw-bg-transparent tw-cursor-pointer tw-text-{accent}-950 tw-text-3xl"
        >⤫</button
      >
      <!-- Create account view ################### -->
      {#if creating}
        <div class="tw-text-lg tw-text-center">Create a Nostr account</div>
        <form class="tw-mt-4 tw-mb-1" on:submit={handleCreate}>
          <div class="tw-flex items-center">
            <!-- svelte-ignore a11y-autofocus -->
            <input
              class="tw-box-border tw-w-40 tw-px-2 tw-py-1 tw-rounded tw-text-lg tw-outline-none tw-text-neutral-800"
              placeholder="bob"
              bind:this={nameInput}
              bind:value={nameInputValue}
              on:input={checkNameInput}
              autofocus
            />
            <div class="tw-mx-2 tw-text-2xl">@</div>
            <select
              class="tw-w-full tw-box-border tw-px-2 tw-py-1 tw-rounded tw-text-lg tw-outline-none tw-text-neutral-800"
              bind:value={chosenProvider}
            >
              {#each providers as prov}
                <option
                  label={prov.domain}
                  value={prov}
                  class="tw-px-2 tw-py-1 tw-text-lg"
                />
              {/each}
            </select>
          </div>
          <div class="tw-text-sm tw-text-center tw-mt-4 tw-leading-4">
            A window from the selected provider will pop up to finalize the
            creation; if it doesn't display check if the browser is blocking it
          </div>
          <button
            class="tw-block tw-w-full tw-mt-4 tw-px-2 tw-py-1 tw-text-lg tw-rounded tw-border-0 tw-bg-{accent}-900 hover:tw-bg-{accent}-950 tw-cursor-pointer tw-text-white disabled:tw-bg-neutral-400 disabled:tw-text-neutral-200 disabled:tw-cursor-default"
            disabled={!chosenProvider || !nameInputValue}
          >
            Create »
          </button>
        </form>
        <div class="tw-mt-6 tw-text-center tw-text-sm tw-leading-3">
          Do you already have a Nostr address?<br />
          <button
            class="tw-border-0 tw-bg-transparent tw-text-white tw-cursor-pointer tw-underline tw-text-sm"
            on:click={handleOpenLogin}>Login now</button
          >
        </div>

        <!-- Login view ################### -->
      {:else if !identity}
        <div class="tw-text-lg tw-text-center">
          How do you want to connect to Nostr?
        </div>
        <form class="flex tw-mt-4 tw-mb-1" on:submit={handleConnect}>
          <!-- svelte-ignore a11y-autofocus -->
          <input
            class="tw-box-border tw-w-full tw-px-2 tw-py-1 tw-rounded tw-text-lg tw-outline-none tw-text-neutral-800"
            placeholder="user@provider or bunker://..."
            bind:this={bunkerInput}
            bind:value={bunkerInputValue}
            autofocus
            disabled={connecting}
          />
          {#if errorMessage}
            <div
              class="tw-my-2 tw-p-2 tw-text-sm tw-leading-4 tw-text-red-400 tw-bg-yellow-100 tw-rounded tw-text-center"
            >
              {errorMessage}
            </div>
          {/if}
          <button
            class="tw-flex tw-w-full tw-mt-4 tw-px-2 tw-py-1 tw-text-lg tw-rounded tw-border-0 tw-bg-{accent}-900 hover:tw-bg-{accent}-950 tw-cursor-pointer tw-text-white disabled:tw-bg-neutral-400 disabled:tw-text-neutral-200 disabled:tw-cursor-default tw-items-center tw-justify-center"
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
            <div class="tw-mt-6 tw-text-center tw-text-sm tw-leading-3">
              Waiting too much?
              <button
                class="tw-border-0 tw-bg-transparent tw-text-white tw-cursor-pointer tw-underline tw-text-sm"
                on:click={handleAbortConnection}>Cancel the connection</button
              >
            </div>
          {/if}
        </form>
        {#if !connecting}
          <div class="tw-mt-6 tw-text-center tw-text-sm tw-leading-3">
            Do you need a Nostr account?<br />
            <button
              class="tw-border-0 tw-bg-transparent tw-text-white tw-cursor-pointer tw-underline tw-text-sm"
              on:click={handleOpenCreate}>Sign up now</button
            >
          </div>
        {/if}

        <!-- Connected view ################### -->
      {:else if identity}
        <div class="tw-text-center">
          <div class="tw-text-sm tw-mb-4">You are connected to Nostr as</div>
          <a
            target="_blank"
            href={'https://nosta.me/' + identity.npub}
            class="tw-text-white tw-no-underline tw-group"
          >
            {#if identity.picture || identity.name}
              <div
                class="tw-flex tw-items-center tw-justify-center tw-gap-2 tw-mb-2"
              >
                {#if identity.picture}
                  <img
                    src={identity.picture}
                    alt=""
                    class="tw-w-10 tw-h-10 tw-rounded-full tw-border-solid tw-border-2 tw-border-transparent group-hover:tw-border-{accent}-100"
                  />
                {/if}
                {#if identity.name}
                  <div
                    class="tw-text-3xl group-hover:tw-underline tw-decoration-2 tw-underline-offset-4"
                  >
                    {identity.name}
                  </div>
                {/if}
              </div>
            {/if}
            <div class="tw-block tw-break-all">{identity.npub}</div>
          </a>
        </div>
        <button
          class="tw-block tw-w-full tw-my-2 tw-mt-6 tw-px-2 tw-py-1 tw-text-lg tw-rounded tw-border-0 tw-bg-{accent}-900 hover:tw-bg-{accent}-950 tw-cursor-pointer tw-text-white"
          on:click={handleDisconnect}>Disconnect</button
        >
        <div class="tw-block tw-break-all tw-mt-6 tw-text-center tw-text-sm">
          This webpage is using the public key:<br />
          {getPublicKey(clientSecret)}
        </div>
      {/if}
    </div>
  {/if}
</div>
