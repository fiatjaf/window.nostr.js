<script lang="ts">
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
    fetchCustodialbunkers as fetchCustodialBunkers,
    type BunkerPointer
  } from 'nostr-tools/nip46'
  import {queryProfile} from 'nostr-tools/nip05'
  import {npubEncode} from 'nostr-tools/nip19'
  import {onMount} from 'svelte'

  const pool = new SimplePool()
  let opened = false
  let bunkerInput: HTMLInputElement
  let bunkerPointer: BunkerPointer | null = null
  let resolveBunker: (_: BunkerSigner) => void
  let bunker: Promise<BunkerSigner> = new Promise(resolve => {
    resolveBunker = resolve
  })
  let connecting = false
  let connected: null | {
    pubkey: string
    npub: string
    name?: string
    picture?: string
    event: NostrEvent | null
  } = null
  let metadataSub: SubCloser

  const bunkerSignerParams: BunkerSignerParams = {
    pool,
    onauth(url: string) {
      console.log('auth', url)
    }
  }

  onMount(() => {
    let data = localStorage.getItem('nip46BunkerPointer')
    if (data) {
      bunkerPointer = JSON.parse(data)
      connect()
    }

    setTimeout(() => {
      if ((window as any).nostr && !(window as any).nostr.isWnj) {
        ;(window as any).destroyWnj()
        return
      } else {
        setupWindowNostr()
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

    connect()
  }

  async function connect() {
    connecting = true

    let clientSecret
    const local = localStorage.getItem('nip46ClientSecretKey')
    if (local) {
      clientSecret = hexToBytes(local)
    } else {
      clientSecret = generateSecretKey()
      localStorage.setItem('nip46ClientSecretKey', bytesToHex(clientSecret))
    }

    let bunker = new BunkerSigner(
      clientSecret,
      bunkerPointer!,
      bunkerSignerParams
    )
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

    resolveBunker(bunker)
  }

  function setupWindowNostr() {
    ;(window as any).nostr = {
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
</script>

<svelte:window on:click={handleClick} />

<div
  class="tw-opacity-50 hover:tw-opacity-100 tw-px-4 tw-py-2 tw-transition-all"
  class:tw-cursor-pointer={!connected && !opened}
>
  {#if connected}
    <div>
      connected as {connected.name || connected.npub}
    </div>
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
      <form class="tw-m-2" on:submit={handleConnect}>
        <input
          class="tw-px-2 tw-py-1 tw-text-lg"
          placeholder="user@provider or bunker://..."
          bind:this={bunkerInput}
        />
        <button
          class="tw-block tw-w-full tw-mt-2 tw-px-2 tw-py-1 tw-text-lg tw-border-0 tw-bg-indigo-800 tw-hover:bg-900 tw-cursor-pointer tw-text-white"
        >
          connect
        </button>
      </form>
    {/if}
  {/if}
</div>
