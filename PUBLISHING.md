# Publishing

The plugin ships from GitHub alone: a public repository plus a GitHub Pages
index. There is no npm package, and nothing in DSH requires one.

```
repo root            the installable package (package.json, cordis.patch.yml, lib/)
site/index.json      the Discover index, published to the gh-pages branch
site/icons/          icons, resolved relative to the index URL
.github/workflows/   validates the index, then republishes site/ to gh-pages
```

## How Pages is wired

Pages serves the **`gh-pages` branch**, not an Actions artifact. The `deploy`
job copies `site/` into a temporary directory, commits it on a fresh
`gh-pages` branch, and force-pushes it with the workflow token. The `validate`
job runs `parseMarketIndex` from `@deepseek-ai/dsh-plugin-market-index` first, so
a malformed index fails the build instead of shipping.

This repository originally used `actions/deploy-pages`, which failed every run
with `Fetching artifact metadata failed` even though the artifact uploaded
successfully; publishing a branch sidesteps that API entirely. The validator's
package version is pinned because the DSH packages publish prereleases and
`latest` can lag the app build; bump the pin when the index format changes.

One-time setup, already done here:

1. Repository <https://github.com/NorwinYu/dsh-deepseek-asr> is public.
2. Settings -> Pages -> Source: **Deploy from a branch**, branch `gh-pages`, folder `/`.
3. `https://norwinyu.github.io/dsh-deepseek-asr/index.json` serves the index.

## Release

A version entry points at an immutable commit, so releasing is two commits: one
with the package, one that records that commit in the index.

```sh
# 1. bump the version in package.json, then commit the package
$EDITOR package.json
git commit -am "release 0.1.2"
SHA=$(git rev-parse HEAD)

# 2. record that commit as a new version entry
python3 - "$SHA" "${NEW_VERSION:-0.1.2}" <<'PY'
import json, sys, time
sha, version = sys.argv[1], sys.argv[2]
p = 'site/index.json'
d = json.load(open(p))
d['plugins'][0]['versions'].insert(0, {
    'version': version,
    'publishTimestamp': int(time.time()),
    'source': {
        'type': 'git',
        'url': 'https://github.com/NorwinYu/dsh-deepseek-asr',
        'commit': sha,
    },
    'engines': {'dsh': '>=0.2.2-rc.1 <0.3.0'},
})
json.dump(d, open(p, 'w'), indent=2, ensure_ascii=False)
open(p, 'a').write('\n')
print('pinned', version, 'to', sha)
PY

git commit -am "index: $NEW_VERSION"
git tag "v$NEW_VERSION"
git push --follow-tags
```

The push touches `site/`, so the workflow redeploys Pages; users see the new
version in Discover after a refresh.

## Rules that bite

- **Never rewrite a commit that an index entry references** (rebase, force push,
  deleting the branch). Installations resolve that exact SHA.
- **The commit must be 40 lowercase hex.** Short SHAs are rejected by the
  validator.
- **The repository must stay public.** Anonymous `git` installs fail on a private
  repository.
- **`version` in `package.json` and in the index must match**; the index decides
  what installs, the manifest is what the plugin manager reports afterwards.
- **Keep `engines.dsh` in sync** with the package's `engines.dsh`, otherwise the
  index advertises compatibility the package itself rejects.
- **Icons are relative to the index URL**: `icons/x.svg` resolves against the
  published `site/` root.

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

The index accepts both source kinds, so an npm release can be added as an
additional version entry without renaming anything:

```json
{ "version": "0.2.0", "publishTimestamp": 1790000000,
  "source": { "type": "npm" }, "engines": { "dsh": ">=0.2.2-rc.1 <0.3.0" } }
```

Publish with `npm publish --access public --provenance` to get an attestation
linking the tarball to this repository and workflow.
