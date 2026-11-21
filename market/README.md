# Publishing the plugin index

`index.json` is a template for DSH's **Discover** tab. It is deliberately
separate from the package: the index is a static file you host, and it points at
npm (or a pinned Git commit), so it can be updated without republishing the
package.

## Before publishing

1. Replace the placeholders: `author`, `homepage`, `repository.url`, and the
   index `title` / `description`.
2. Publish the package: `npm publish --access public` from the repository root.
3. Set `versions[0].publishTimestamp` to the real publish time in Unix seconds
   (`date +%s`).
4. Keep `engines.dsh` in sync with the package's own `engines.dsh`.

## Hosting

Serve `index.json` and the `icons/` directory side by side over HTTPS from any
static host (GitHub Pages, object storage, a CDN). Relative icon paths resolve
against the index URL, so this layout works unchanged:

```
https://example.com/dsh/index.json
https://example.com/dsh/icons/dsh-deepseek-asr.svg
```

An `http:` index is accepted, but anyone on the network path could rewrite the
install specs it lists; use `https:`.

## Checking the index

The format is validated strictly, and one bad field rejects the whole document.
The checker from DSH's own repository can be used before publishing:

```sh
node -e "import('@deepseek-ai/dsh-plugin-market-index').then(async ({ parseMarketIndex }) => {
  const fs = await import('node:fs/promises')
  const doc = JSON.parse(await fs.readFile('index.json', 'utf8'))
  console.log(parseMarketIndex(doc, 'https://example.com/dsh/index.json').plugins.length, 'plugins')
})"
```

Alternatively, install the reference generator from the DSH checkout and let it
build the index from a list of package names:

```sh
pnpm --filter @deepseek-ai/dsh-plugin-market-generator start \
  --input plugins.txt --output site/index.json --title "DeepSeek ASR for DSH"
```

## Using it

1. Enable **Custom plugin indexes** in the plugin manager.
2. Open **Discover -> Add index source** and paste the index URL.
3. Open **DeepSeek ASR**, install the listed version, and enable the built-in
   **Voice input** bundle if you have not already.
