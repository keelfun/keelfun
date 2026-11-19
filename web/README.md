# Keel web

Next.js static frontend for [keelfun.app](https://keelfun.app), served by the `keel-web` Cloudflare Worker.

```bash
npm run dev
NEXT_PUBLIC_API_URL=https://api.keelfun.app NEXT_PUBLIC_CHAIN_ID=8453 npm run build   # static export to out/
npx wrangler deploy
```
