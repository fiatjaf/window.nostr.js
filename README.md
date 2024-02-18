# window.nostr.js

a small `<script>` you can drop in any page that already uses [NIP-07](https://nips.nostr.com/7) and make it also work with [NIP-46](https://nips.nostr.com/46) automatically when the user doesn't have an extension installed.

## How to use it

Include `<script src="https://unpkg.com/window.nostr.js/dist/window.nostr.js"></script>` in your HTML and proceed to use [`window.nostr`](https://nips.nostr.com/7) normally.

## Bookmarklet

If a website has opted to not include this, but you like it, you can still use it on the website. Just add this to your browser bookmarks and click on it to load the widget on any website:

```
javascript:void((function(){var%20e=document.createElement('script');e.setAttribute('src','https://unpkg.com/window.nostr.js/dist/window.nostr.js');document.body.appendChild(e)})())
```
