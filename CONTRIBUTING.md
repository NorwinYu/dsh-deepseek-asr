# Contributing

Thanks for taking a look. This bundle intentionally stays small: it owns one
recognizer and nothing else. Changes that add settings, rewrite the microphone
UI, or bundle a model are out of scope — the built-in Voice input bundle owns
that surface.

## Before you open a pull request

```sh
node test/manifest.mjs
for f in lib/*.js lib/*.mjs test/*.mjs; do node --check "$f"; done
```

`manifest.mjs` checks the invariants DSH relies on: the bundle declares
`dsh.bundle.patch`, every referenced file exists, the patch's relative provider
path resolves, the locale has its metadata, and `site/index.json` advertises the
same version as `package.json`.

The end-to-end test needs a DeepSeek key and real audio:

```sh
node test/smoke.mjs /path/to/16k-mono.wav
```

## Rules

- **Never commit a key, a recording, or a transcript**, and keep the repository
  free of absolute paths from your machine.
- **Keep the provider contract.** `transcribe()` returns
  `{ text, audioSeconds, inferenceSeconds }`; a bare string fails Remote result
  decoding in the browser.
- **Keep `engines.dsh` honest.** The provider depends on experimental
  `@deepseek-ai/dsh-experimental-*` packages, so a compatible minor range is
  better than `*`.
- **Update the index with the release**, not before: see
  [PUBLISHING.md](PUBLISHING.md). A version entry must point at a commit that
  exists and never gets rewritten.
- **State cost and privacy plainly** in any user-facing text. The endpoint is
  paid, and the audio leaves the machine.

## Releasing

Maintainers follow [PUBLISHING.md](PUBLISHING.md): bump `package.json`, commit,
pin the new commit in `site/index.json`, tag `vX.Y.Z`, push. Pages redeploys and
users see the new version in Discover.
