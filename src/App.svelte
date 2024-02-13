<script lang="ts">
  let opened = false

  function handleClick(ev: MouseEvent) {
    if (
      ev
        .composedPath()
        .find((el: any) => console.log(el) || el.id === 'windowNostrModal')
    )
      return
    opened = false
  }
</script>

<svelte:window on:click={handleClick} />

<div class="tw-opacity-50 hover:tw-opacity-100">
  <div class="tw-flex tw-items-center tw-justify-center">
    {#if opened}
      connect with
    {/if}
    <button
      class="tw-cursor-pointer tw-transition-all tw-text-indigo-700 tw-border-0 tw-outline-0"
      on:click={() => {
        opened = !opened
      }}
    >
      NOSTR
    </button>
  </div>
  {#if opened}
    <div class="tw-m-2">
      <input
        class="tw-px-2 tw-py-1 tw-text-lg"
        placeholder="user@provider or bunker://..."
      />
      <button
        class="tw-block tw-w-full tw-mt-2 tw-px-2 tw-py-1 tw-text-lg tw-border-0 tw-bg-indigo-800 tw-hover:bg-900 tw-cursor-pointer tw-text-white"
      >
        connect
      </button>
    </div>
  {/if}
</div>
