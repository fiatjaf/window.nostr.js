# window.nostr.js

a small `<script>` you can drop in any page that already uses [NIP-07](https://nips.nostr.com/7) and make it also work with [NIP-46](https://nips.nostr.com/46) automatically when the user doesn't have an extension installed.

It adds a small floating button on the side of the window that users can use to create Nostr accuonts or connect to their NIP-46 bunkers.

## How to use it

Include `<script src="https://unpkg.com/window.nostr.js/dist/window.nostr.js"></script>` in your HTML and proceed to use [`window.nostr`](https://nips.nostr.com/7) normally.

## Bookmarklet

If a website has opted to not include this, but you like it, you can still use it on the website. Just add this to your browser bookmarks and click on it to load the widget on any website:

```
javascript:void((function(){var%20e=document.createElement('script');e.setAttribute('src','https://unpkg.com/window.nostr.js/dist/window.nostr.js');document.body.appendChild(e)})())
```

## Demo videos

https://github.com/fiatjaf/window.nostr.js/assets/1653275/eacb1302-bbfd-4d28-aec2-dbe231f92c53

https://github.com/fiatjaf/window.nostr.js/assets/1653275/8c2546f1-439a-4a1b-beb6-af540de37601

