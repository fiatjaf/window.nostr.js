<script lang="ts">
  import {hexToBytes, bytesToHex} from '@noble/hashes/utils'
  import {
    generateSecretKey,
    type VerifiedEvent,
    type UnsignedEvent
  } from 'nostr-tools/pure'
  import {SimplePool} from 'nostr-tools/pool'
  import {
    BunkerSigner,
    type BunkerSignerParams,
    createAccount,
    parseBunkerInput,
    fetchCustodialbunkers as fetchCustodialBunkers
  } from 'nostr-tools/nip46'
  import {queryProfile} from 'nostr-tools/nip05'
  import {npubEncode} from 'nostr-tools/nip19'

  const pool = new SimplePool()
  let opened = false
  let bunkerInput: HTMLInputElement
  let bunker: BunkerSigner
  let connected: null | {
    pubkey: string
    npub: string
    name?: string
    picture?: string
  } = null

  const bunkerSignerParams: BunkerSignerParams = {
    pool,
    onauth(url: string) {
      console.log('auth', url)
    }
  }

  function handleClick(ev: MouseEvent) {
    if (ev.composedPath().find((el: any) => el.id === 'windowNostrModal'))
      opened = true
    else opened = false
  }

  async function handleConnect(ev: SubmitEvent) {
    ev.preventDefault()
    let bp = await parseBunkerInput(bunkerInput.value)
    if (!bp) {
      bunkerInput.setCustomValidity(
        'invalid NIP-05 "name@domain.com" address or bunker:// URI'
      )
      return
    }

    let clientSecret
    const local = localStorage.getItem('nip46ClientSecretKey')
    if (local) {
      clientSecret = hexToBytes(local)
    } else {
      clientSecret = generateSecretKey()
      localStorage.setItem('nip46ClientSecretKey', bytesToHex(clientSecret))
    }
    bunker = new BunkerSigner(clientSecret, bp, bunkerSignerParams)

    await bunker.connect()

    connected = {
      pubkey: bunker.remotePubkey,
      npub: npubEncode(bunker.remotePubkey)
    }
  }
</script>

<svelte:window on:click={handleClick} />

<div
  class="tw-opacity-50 hover:tw-opacity-100 tw-px-4 tw-py-2 tw-transition-all"
  class:tw-cursor-pointer={!opened}
>
  {#if connected}
    <div>
      connected as {connected.name || connected.npub}
    </div>
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
