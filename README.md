# window.nostr.js

a small `<script>` you can drop in any page that already uses [NIP-07](https://nips.nostr.com/7) and make it also work with [NIP-46](https://nips.nostr.com/46) automatically when the user doesn't have an extension installed.

It adds a small floating button on the side of the window that users can use to create Nostr accuonts or connect to their NIP-46 bunkers.

## How to use it

Include `<script src="https://unpkg.com/window.nostr.js/dist/window.nostr.js"></script>` in your HTML and proceed to use [`window.nostr`](https://nips.nostr.com/7) normally.

## Customization
The script supports some optional configurations to personalize the design:

```
<script>
  window.wnjParams = {
    position: 'bottom',
    // The only accepted value is 'bottom', default is top
    accent: 'green',
    // Supported values: cyan (default), green, purple, red, orange, neutral, stone
    startHidden: true,
    // If the host page has a button that call `getPublicKey` to start a
    // login procedure, the minimized widget can be hidden until connected
    disableOverflowFix: true,
    // If the host page on mobile has an horizontal scrolling, the floating
    // element/modal are pushed to the extreme right/bottom and exit the
    // viewport. A style is injected in the html/body elements fix this.
    // This option permit to disable this default behavior
  }
</script>
<script src="https://unpkg.com/window.nostr.js/dist/window.nostr.js"></script>
```

## Bookmarklet

If a website has opted to not include this, but you like it, you can still use it on the website. Just add this to your browser bookmarks and click on it to load the widget on any website:

```
javascript:void((function(){var%20e=document.createElement('script');e.setAttribute('src','https://unpkg.com/window.nostr.js/dist/window.nostr.js');document.body.appendChild(e)})())
```

## Demo videos

https://github.com/fiatjaf/window.nostr.js/assets/1653275/eacb1302-bbfd-4d28-aec2-dbe231f92c53

https://github.com/fiatjaf/window.nostr.js/assets/1653275/8c2546f1-439a-4a1b-beb6-af540de37601

