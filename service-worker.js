importScripts('https://storage.googleapis.com/workbox-cdn/releases/5.1.4/workbox-sw.js');

if (workbox) {
  console.log(`Yay! Workbox is loaded 🎉Service Worker is working!`);
} else {
  console.log(`Boo! Workbox didn't load 😬Service Worker won't work properly...`);
}

const { registerRoute } = workbox.routing;
const { CacheFirst, StaleWhileRevalidate } = workbox.strategies;
const { ExpirationPlugin } = workbox.expiration;
const { precacheAndRoute, matchPrecache } = workbox.precaching;

precacheAndRoute([{"revision":"879e4852f4f6037428eeb7e019fd92d2","url":"favicon.ico"},{"revision":"11f5a5b052878df74b4ac95e530ff49d","url":"icon-black.png"},{"revision":"a3c3b9455114d88e7942b3b8f97147a3","url":"icon-primary.png"},{"revision":"a92ba365f8006bcfff9b8e487c20418c","url":"icon-white.png"},{"revision":"879e4852f4f6037428eeb7e019fd92d2","url":"images/$__favicon.ico"},{"revision":"97df5a777e0f3d1f68d7189b6f588f92","url":"images/AddPluginInfoButton.png"},{"revision":"1f0589099665caf696d8b89d9b33b727","url":"images/CommentSection_cn.png"},{"revision":"6626da8cc52cb65aaa1c9a93c8375515","url":"images/CommentSection_en.png"},{"revision":"77497c6be59dbb85b5a6dc5dcfe58009","url":"images/install_en.gif"},{"revision":"167354d0c3d7ada81ffab410805d2dd8","url":"images/install_zh.gif"},{"revision":"498de7851705db56b8812bf1d52733b3","url":"images/kin-filter-concept.svg"},{"revision":"b69aabe0914a7bcc47da2209d9f3fa35","url":"images/PluginInfoEditor_cn.png"},{"revision":"668243d998a61723550c5c36a6c8fa53","url":"images/PluginInfoEditor_en.png"},{"revision":"08d6a36f63b6e1ce27428918002c864d","url":"images/SidebarResizerDemo.gif"},{"revision":"be664699adf5587a79263ee55af988fc","url":"index.html"},{"revision":"6b8b9576b1e95d8d8fb03f6792a826fc","url":"library/callback.tid"},{"revision":"9cea5d2af6ed9bcacdb348c557f39d5a","url":"library/index.html"},{"revision":"b608259b2ad9bd1aceceb38ce653d9d7","url":"tiddlywikicore-5.2.1.js"}]);

registerRoute(
  /\.css$/,
  // Use cache but update in the background.
  new StaleWhileRevalidate({
    // Use a custom cache name.
    cacheName: 'css-cache',
  })
);

registerRoute(
  /\.(?:png|jpg|jpeg|svg|gif|woff2?|ttf)$/,
  // Use the cache if it's available.
  new CacheFirst({
    cacheName: 'image-cache',
    plugins: [
      new ExpirationPlugin({
        // Cache only a few images.
        maxEntries: 100,
        // Cache for a maximum of a week.
        maxAgeSeconds: 7 * 24 * 60 * 60,
      }),
    ],
  })
);

registerRoute(/\.js$/, new StaleWhileRevalidate());
registerRoute(/(^\/$|index.html)/, new StaleWhileRevalidate());
