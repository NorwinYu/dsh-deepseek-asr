# Publishing

The plugin ships from GitHub alone: a public repository plus a GitHub Pages
index. There is no npm package, and nothing in DSH requires one.

```
repo root            the installable package (package.json, cordis.patch.yml, lib/)
site/index.json      the Discover index, served by Pages
site/icons/          icons, resolved relative to the index URL
.github/workflows/   validates the index, then deploys site/ to Pages
```

## One-time setup

1. Repository: <https://github.com/NorwinYu/dsh-deepseek-asr> (public).
2. Settings -> Pages -> Source: **GitHub Actions**.
3. First push to `main` deploys `site/` and prints the URL
   `https://norwinyu.github.io/dsh-deepseek-asr/`.

The workflow runs `parseMarketIndex` from `@deepseek-ai/dsh-plugin-market-index`
before deploying, so a malformed index fails the build instead of shipping. The
package version is pinned there because the DSH packages publish prereleases and
`latest` can lag the app build; bump it when the index format changes.

## Release

A version entry points at an immutable commit, so releasing is two commits: one
with the package, one that records that commit in the index.

```sh
# 1. bump the version in package.json, then commit the package
git commit -am "release 0.1.1"
SHA=$(git rev-parse HEAD)

# 2. record that commit in the index
python3 - "$SHA" <<'PY'
import json, sys, time
sha = sys.argv[1]
p = 'site/index.json'
d = json.load(open(p))
entry = d['plugins'][0]
entry['versions'].insert(0, {
    'version': '0.1.1',
    'publishTimestamp': int(time.time()),
    'source': {'type': 'git', 'url': 'https://github.com/NorwinYu/dsh-deepseek-asr', 'commit': sha},
    'engines': {'dsh': '>=0.2.2-rc.1 <0.3.0'},
})
json.dump(d, open(p, 'w'), indent=2, ensure_ascii=False)
open(p, 'a').write('\n')
PY

git commit -am "index: 0.1.1"
git tag v0.1.1
git push --follow-tags
```

Pages redeploys on the second push; users see the new version in Discover after
a refresh.

## Rules that bite

- **Never rewrite a commit that an index entry references** (rebase, force push,
  deleting the branch). Installations resolve that exact SHA.
- **The commit must be 40 lowercase hex.** Short SHAs are rejected by the
  validator.
- **The repository must stay public.** Anonymous `git` installs fail on a private
  repository.
- **`version` in `package.json` and in the index must match**; DSH installs the
  index entry, but the manifest is what the plugin manager reports afterwards.
- **Keep `engines.dsh` in sync** with the package's `engines.dsh`, otherwise the
  index advertises compatibility the package itself rejects.
- **Icons are relative to the index URL**: `icons/x.svg` resolves against
  `site/`, which is what Pages serves.

## Checking an index by hand

```sh
npm install --no-save @deepseek-ai/dsh-plugin-market-index@0.2.2-rc.5
node --input-type=module -e "
  import { readFile } from 'node:fs/promises'
  import { parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index'
  const doc = JSON.parse(await readFile('site/index.json', 'utf8'))
  console.log(parseMarketIndex(doc, 'https://norwinyu.github.io/dsh-deepseek-asr/index.json').plugins[0])
"
```

## Adding npm later

The index accepts both source kinds, so an npm release can be added as a second
version entry without renaming anything:

```json
{ "version": "0.2.0", "publishTimestamp": 1790000000,
  "source": { "type": "npm" }, "engines": { "dsh": ">=0.2.2-rc.1 <0.3.0" } }
```

Publish with `npm publish --access public --provenance` to get an attestation
linking the tarball to this repository and workflow.
