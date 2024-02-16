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

    setTimeout(() => {
      if (win.nostr && !win.nostr.isWnj) {
        win.destroyWnj()
        return
      } else {
        win.nostr = {
          isWnj: true,
          async getPublicKey(): Promise<string> {
            if (!connecting) opened = true
            return (await bunker).remotePubkey
          },
          async signEvent(event: NostrEvent): Promise<VerifiedEvent> {
            if (!connecting) opened = true
            return (await bunker).signEvent(event)
          }
        }
      }
    }, 3000)

    return () => {
      if (metadataSub) metadataSub.close()
    }
  })

  function handleClick(ev: MouseEvent) {
    if (ev.composedPath().find((el: any) => el.id === 'windowNostrModal'))
      opened = true
    else opened = false
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
      pubkey: bunker.remotePubkey,
      npub: npubEncode(bunker.remotePubkey),
      event: null
    }

    localStorage.setItem('nip46BunkerPointer', JSON.stringify(bunkerPointer))

    // load metadata
    metadataSub = pool.subscribeMany(
      [
        'wss://purplepag.es',
        'wss://relay.snort.social',
        'wss://relay.nos.social'
      ],
      [{kinds: [0], authors: [bunker.remotePubkey]}],
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
  class="tw-opacity-50 hover:tw-opacity-100 tw-px-4 tw-py-2 tw-transition-all"
  class:tw-cursor-pointer={!connected && !opened}
>
  {#if creating}
    <form class="tw-mt-2 tw-mb-1" on:submit={handleCreate}>
      <div class="tw-flex items-center">
        <input
          class="tw-px-2 tw-py-1 tw-text-lg tw-text-right"
          placeholder="bob"
          bind:this={nameInput}
          on:input={checkNameInput}
        />
        <select
          class="tw-ml-2 tw-px-2 tw-py-1 tw-text-lg"
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
        class="tw-block tw-w-full tw-mt-2 tw-px-2 tw-py-1 tw-text-lg tw-border-0 tw-bg-indigo-800 tw-hover:bg-indigo-900 tw-cursor-pointer tw-text-white"
      >
        create
      </button>
    </form>
  {:else if connected}
    <div class="tw-text-right">
      {#if opened}
        connected as
      {/if}
      {connected.name ||
        connected.npub.slice(0, 7) + '…' + connected.npub.slice(-4)}
    </div>
    {#if opened}
      <div class="tw-my-2">
        <a
          target="_blank"
          href={'https://nosta.me/' + connected.npub}
          class="tw-no-underline tw-text-inherit tw-text-xs">{connected.npub}</a
        >
        <button
          class="tw-block tw-w-full tw-mt-2 tw-px-2 tw-py-1 tw-text-sm tw-border-0 tw-bg-zinc-700 tw-hover:bg-zinc-900 tw-cursor-pointer tw-text-white"
          on:click={handleDisconnect}>disconnect</button
        >
      </div>
    {/if}
  {:else if connecting}
    <div>connecting to bunker</div>
  {:else}
    <div class="tw-flex tw-items-center tw-justify-center">
      {#if opened}
        connect with
      {/if}
      <span class="tw-ml-1 tw-text-indigo-700 tw-border-0 tw-outline-0">
        NOSTR
      </span>
    </div>
    {#if opened}
      <form class="tw-mt-2 tw-mb-1" on:submit={handleConnect}>
        <input
          class="tw-px-2 tw-py-1 tw-text-lg"
          placeholder="user@provider or bunker://..."
          bind:this={bunkerInput}
        />
        <button
          class="tw-block tw-w-full tw-mt-2 tw-px-2 tw-py-1 tw-text-lg tw-border-0 tw-bg-indigo-800 tw-hover:bg-indigo-900 tw-cursor-pointer tw-text-white"
        >
          connect
        </button>
      </form>
      <div class="tw-text-right tw-mb-1">
        <button
          class="tw-border-0 tw-text-sm tw-cursor-pointer hover:tw-underline"
          on:click={handleOpenCreate}>create account</button
        >
      </div>
    {/if}
  {/if}
</div>
