<script lang="ts">
  import debounce from 'debounce'
  import {hexToBytes, bytesToHex} from '@noble/hashes/utils'
  import {
    generateSecretKey,
    type VerifiedEvent,
    type NostrEvent
  } from 'nostr-tools/pure'
  import {SimplePool, type SubCloser} from 'nostr-tools/pool'
  import {
    BunkerSigner,
    type BunkerSignerParams,
    createAccount,
    parseBunkerInput,
    fetchCustodialBunkers,
    type BunkerPointer,
    type BunkerProfile
  } from 'nostr-tools/nip46'
  import {queryProfile} from 'nostr-tools/nip05'
  import {npubEncode} from 'nostr-tools/nip19'
  import {onMount} from 'svelte'

  const win = window as any
  const pool = new SimplePool()
  let bunkerInput: HTMLInputElement
  let nameInput: HTMLInputElement
  let chosenProvider: BunkerProfile | undefined
  let clientSecret: Uint8Array
  let nip46BunkerPointer: string
  const local = localStorage.getItem('nip46ClientSecretKey')
  if (local) {
    clientSecret = hexToBytes(local)
  } else {
    clientSecret = generateSecretKey()
    localStorage.setItem('nip46ClientSecretKey', bytesToHex(clientSecret))
  }

  let opened: Boolean
  let bunkerPointer: BunkerPointer | null
  let resolveBunker: (_: BunkerSigner) => void
  let bunker: Promise<BunkerSigner>
  let connecting: boolean
  let creating: boolean
  let connected: null | {
    pubkey: string
    npub: string
    name?: string
    picture?: string
    event: NostrEvent | null
  }
  let metadataSub: SubCloser | null
  let providers: BunkerProfile[] = []
  reset()

  let windowNostr = {
    isWnj: true,
    async getPublicKey(): Promise<string> {
      if (!connecting && !connected) opened = true
      return (await bunker).bp.pubkey
    },
    async signEvent(event: NostrEvent): Promise<VerifiedEvent> {
      if (!connecting && !connected) opened = true
      return (await bunker).signEvent(event)
    },
    async getRelays(): Promise<{
      [url: string]: {read: boolean; write: boolean}
    }> {
      if (!connecting && !connected) opened = true
      return (await bunker).getRelays()
    },
    nip04: {
      async encrypt(pubkey: string, plaintext: string): Promise<string> {
        if (!connecting && !connected) opened = true
        return (await bunker).nip04Encrypt(pubkey, plaintext)
      },
      async decrypt(pubkey: string, ciphertext: string): Promise<string> {
        if (!connecting && !connected) opened = true
        return (await bunker).nip04Decrypt(pubkey, ciphertext)
      }
    }
  }

  function reset() {
    opened = false
    bunkerPointer = null
    bunker = new Promise(resolve => {
      resolveBunker = resolve
    })
    connecting = false
    creating = false
    connected = null
    metadataSub = null
  }

  const bunkerSignerParams: BunkerSignerParams = {
    pool,
    onauth(url: string) {
      window.open(url, 'window.nostr', `width=600,height=800,popup=yes`)
    }
  }

  onMount(() => {
    let data = localStorage.getItem('nip46BunkerPointer')
    if (data) {
      bunkerPointer = JSON.parse(data)
      connecting = true
      connect(
        new BunkerSigner(clientSecret, bunkerPointer!, bunkerSignerParams)
      )
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
    if (ev.composedPath().find((el: any) => el.id === 'windowNostrModal'))
      opened = true
    else opened = false
  }

  function handleCloseModal(ev: MouseEvent) {
    opened = false
    creating = false
    ev.stopPropagation()
  }

  async function handleConnect(ev: SubmitEvent) {
    ev.preventDefault()
    bunkerPointer = await parseBunkerInput(bunkerInput.value)
    if (!bunkerPointer) {
      bunkerInput.setCustomValidity(
        'invalid NIP-05 "name@domain.com" address or bunker:// URI'
      )
      return
    }

    bunkerInput.setCustomValidity('')
    connect(new BunkerSigner(clientSecret, bunkerPointer!, bunkerSignerParams))
  }

  async function handleDisconnect(ev: MouseEvent) {
    ev.preventDefault()
    localStorage.removeItem('nip46BunkerPointer')
    if (win.isWnj) delete win.nostr
    reset()
  }

  async function handleOpenCreate(ev: MouseEvent) {
    ev.preventDefault()
    creating = true
    if (providers.length === 0)
      providers = await fetchCustodialBunkers(pool, ['wss://relay.nostr.band'])
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
    opened = true
    creating = false

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

  async function connect(bunker: BunkerSigner) {
    await bunker.connect()

    // set this so the floating thing will update
    connected = {
      pubkey: bunker.bp.pubkey,
      npub: npubEncode(bunker.bp.pubkey),
      event: null
    }
    connecting = false

    localStorage.setItem('nip46BunkerPointer', JSON.stringify(bunkerPointer))
    if (typeof bunkerPointer?.pubkey === 'string') {
      nip46BunkerPointer = bunkerPointer?.pubkey
    }

    // load metadata
    metadataSub = pool.subscribeMany(
      [
        'wss://purplepag.es',
        'wss://relay.snort.social',
        'wss://relay.nos.social'
      ],
      [{kinds: [0], authors: [bunker.bp.pubkey]}],
      {
        onevent(evt) {
          if ((connected!.event?.created_at || 0) >= evt.created_at) return
          try {
            let {name, picture} = JSON.parse(evt.content)
            connected!.event = evt
            connected!.name = name
            connected!.picture = picture
          } catch (err) {
            /***/
          }
        }
      }
    )

    opened = false
    resolveBunker(bunker)
  }
</script>

<svelte:window on:click={handleClick} />

<div
  class="tw-text-white tw-font-sans"
  class:tw-cursor-pointer={!connected && !opened}
>
  <!-- Close status ################### -->
  {#if !opened}
    <div
      class="tw-px-4 tw-py-2 tw-bg-cyan-700 hover:tw-bg-cyan-800 tw-rounded tw-cursor-pointer tw-shadow-[0_0px_10px_0px_rgba(0,0,0,0.3)]"
    >
      <!-- Connecting view ################### -->
      {#if connecting}
        <div>Connecting to bunker...</div>
      {:else if !connected}
        Login with Nostr
      {:else}
        <div class="tw-flex tw-items-center">
          {#if connected.picture}
            <img
              src={connected.picture}
              alt=""
              class="tw-w-5 tw-h-5 tw-rounded-full tw-mr-2"
            />
          {:else}
            ☉
          {/if}
          {connected.name ||
            connected.npub.slice(0, 7) + '…' + connected.npub.slice(-4)}
        </div>
      {/if}
    </div>

    <!-- Open status ################### -->
  {:else}
    <div
      class="tw-w-80 tw-px-6 tw-py-8 tw-bg-cyan-700 tw-rounded-md tw-shadow-[0_0px_30px_0px_rgba(0,0,0,0.6)] tw-transition-all tw-animate-show"
    >
      <button
        on:click={handleCloseModal}
        class="tw-absolute tw-top-0 tw-right-0.5 tw-bg-transparent tw-border-none tw-cursor-pointer tw-text-cyan-950 tw-text-3xl"
        >⤫</button
      >
      <!-- Create account view ################### -->
      {#if creating}
        <div class="tw-text-lg tw-text-center">Create a new Nostr account</div>
        <form class="tw-mt-4 tw-mb-1" on:submit={handleCreate}>
          <div class="tw-flex items-center">
            <input
              class="tw-box-border tw-w-full tw-px-2 tw-py-1 tw-rounded tw-text-lg tw-border-none tw-outline-none"
              placeholder="bob"
              bind:this={nameInput}
              on:input={checkNameInput}
              autofocus
            />
            <div class="tw-mx-2 tw-text-2xl">@</div>
            <select
              class="tw-w-full tw-box-border tw-px-2 tw-py-1 tw-rounded tw-text-lg tw-border-none tw-outline-none"
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
          <button
            class="tw-block tw-w-full tw-mt-4 tw-px-2 tw-py-1 tw-text-lg tw-rounded tw-border-0 tw-bg-cyan-900 hover:tw-bg-cyan-950 tw-hover:bg-indigo-900 tw-cursor-pointer tw-text-white"
          >
            create
          </button>
        </form>

        <!-- Login view ################### -->
      {:else if !connected}
        <div class="tw-text-lg tw-text-center">
          How do you want to connect to Nostr?
        </div>
        <form class="flex tw-mt-4 tw-mb-1" on:submit={handleConnect}>
          <input
            class="tw-box-border tw-w-full tw-px-2 tw-py-1 tw-rounded tw-text-lg tw-border-none tw-outline-none"
            placeholder="user@provider or bunker://..."
            bind:this={bunkerInput}
            autofocus
          />
          <button
            class="tw-block tw-w-full tw-mt-4 tw-px-2 tw-py-1 tw-text-lg tw-rounded tw-border-0 tw-bg-cyan-900 hover:tw-bg-cyan-950 tw-hover:bg-indigo-900 tw-cursor-pointer tw-text-white"
          >
            Connect »
          </button>
        </form>
        <div class="tw-mt-6 tw-text-center tw-text-sm tw-leading-3">
          Do you need a Nostr account?
          <button
            class="tw-border-0 tw-bg-transparent tw-text-white tw-cursor-pointer tw-underline tw-text-sm"
            on:click={handleOpenCreate}>Get one now for free</button
          >
        </div>

        <!-- Connected view ################### -->
      {:else if connected}
        <div class="tw-text-center">
          <div class="tw-text-sm tw-mb-4">You are currently connect to Nostr as</div>
          <a target="_blank" href={'https://nosta.me/' + connected.npub}
            class="tw-text-white tw-no-underline tw-group"
          >
            {#if connected.picture || connected.name}
              <div
                class="tw-flex tw-items-center tw-justify-center tw-gap-2 tw-mb-2"
              >
                {#if connected.picture}
                  <img
                    src={connected.picture}
                    alt=""
                    class="tw-w-10 tw-h-10 tw-rounded-full tw-border-solid tw-border-2 tw-border-transparent group-hover:tw-border-cyan-100"
                  />
                {/if}
                {#if connected.name}
                  <div
                    class="tw-text-3xl group-hover:tw-underline tw-decoration-2 tw-underline-offset-4"
                  >
                    {connected.name}
                  </div>
                {/if}
              </div>
            {/if}
            <div class="tw-block tw-break-all">{connected.npub}</div>
          </a>
        </div>
        <button
          class="tw-block tw-w-full tw-my-2 tw-mt-6 tw-px-2 tw-py-1 tw-text-lg tw-rounded tw-border-0 tw-bg-cyan-900 hover:tw-bg-cyan-950 tw-hover:bg-indigo-900 tw-cursor-pointer tw-text-white"
          on:click={handleDisconnect}>Disconnect</button
        >
        <div class="tw-block tw-break-all tw-mt-6 tw-text-center tw-text-sm">
          The bunker public key is:<br/>
          {nip46BunkerPointer}
        </div>
      {/if}
    </div>
  {/if}
</div>
