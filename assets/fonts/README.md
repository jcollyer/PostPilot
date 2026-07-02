# Brand font — Geist

The marketing site and app use **Geist** (loaded via `next/font/google` in
`apps/web/src/app/layout.tsx`). Geist is a neutral Swiss-style grotesque used
here as a free, embeddable stand-in for Ramp's **Lausanne**.

- License: SIL Open Font License 1.1 (free for commercial use + embedding)
- Weights used on the site: 400 / 500 / 600 / 700

## Get the TTF for Rive

Rive embeds a real font file, so grab the static TTFs and drop them here
(`assets/fonts/`), then import into your Rive text run:

1. Google Fonts: https://fonts.google.com/specimen/Geist → "Get font" →
   "Download all" (gives static `Geist-Regular.ttf`, `-Medium`, `-SemiBold`,
   `-Bold`, etc.), **or**
2. Official source (Vercel): https://github.com/vercel/geist-font/releases →
   download the latest release zip → use the files under `Geist/ttf/`.

In the Rive editor: select the text object → Font → import the `.ttf`. Use the
same weight as the matching site text (headlines = SemiBold/Bold 600–700, body
= Regular 400) so the animation matches the page.

> Note: Rive imports `.ttf` / `.otf`. Don't use `.woff2` from the web build —
> use the static TTFs above.

## Brand colors (for Rive fills)

- Lime: `#e8f256`
- Near-black ink: `#0b0a08`
- White: `#ffffff`
