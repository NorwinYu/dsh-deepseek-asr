/**
 * Structural checks for the bundle. No network, no API key, no audio: this is
 * what CI runs on every push and pull request.
 *
 * Usage: node test/manifest.mjs
 */

import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

function check(condition, message) {
  if (!condition) failures.push(message)
}

async function exists(path) {
  try {
    await stat(join(root, path))
    return true
  } catch {
    return false
  }
}

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))

check(/^[a-z0-9][a-z0-9._-]*$/.test(pkg.name), 'package name is a valid npm name')
check(/^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/.test(pkg.version), 'version is semver')
check(pkg.type === 'module', 'package is ESM')
check(pkg.license === 'MIT', 'license is MIT')
check(pkg.dsh?.bundle?.patch === './cordis.patch.yml', 'declares dsh.bundle.patch')
check(typeof pkg.engines?.dsh === 'string' && pkg.engines.dsh.length > 0, 'declares engines.dsh')
check(pkg.peerDependencies === undefined,
  'no peer dependency on app bundles; the Voice input bundle ships with the app')

const referenced = [pkg.dsh.bundle.patch, pkg.icon, ...Object.values(pkg.exports ?? {})]
  .filter((value) => typeof value === 'string' && !value.includes('*'))
for (const path of referenced) {
  check(await exists(path), `referenced file exists: ${path}`)
}

const patch = await readFile(join(root, pkg.dsh.bundle.patch), 'utf8')
const relativeNames = [...patch.matchAll(/^\s*name:\s*["']?(\.{1,2}\/[^"'\s]+)["']?\s*$/gm)]
  .map((match) => match[1])
check(relativeNames.length > 0, 'the patch inserts at least one file from this package')
for (const name of relativeNames) {
  check(await exists(name), `patch references an existing file: ${name}`)
}
check(/defaultProvider:\s*deepseek-asr/.test(patch), 'the patch points defaultProvider at the provider')
check(/- id:\s*speech-to-text-sensevoice[\s\S]*?disabled:\s*true/.test(patch),
  'the patch disables the local recognizer row')

const locale = JSON.parse(await readFile(join(root, 'locale/en.json'), 'utf8'))
check(typeof locale.meta?.title === 'string' && locale.meta.title.length > 0, 'locale has meta.title')
check(typeof locale.meta?.description === 'string', 'locale has meta.description')
if (typeof locale.meta?.detail === 'string') {
  check(await exists(locale.meta.detail), `locale detail document exists: ${locale.meta.detail}`)
}

const icon = await readFile(join(root, 'icon.svg'), 'utf8')
check(icon.trimStart().startsWith('<svg'), 'icon.svg is an SVG document')

const readme = await readFile(join(root, 'README.md'), 'utf8')
check(!readme.startsWith('---\n'), 'README has no YAML frontmatter (GitHub would render it as a table)')
check(readme.length > 1000, 'README is substantive')
check(/paid/i.test(readme), 'README states that the endpoint is a paid API')

const index = JSON.parse(await readFile(join(root, 'site/index.json'), 'utf8'))
const entry = index.plugins?.[0]
check(index.format === 1, 'index declares format 1')
check(entry?.name === pkg.name, 'index lists this package name')
check(entry?.versions?.[0]?.version === pkg.version,
  `index latest version (${entry?.versions?.[0]?.version}) matches package.json (${pkg.version})`)
check(entry?.versions?.[0]?.engines?.dsh === pkg.engines?.dsh,
  'index and package agree on engines.dsh')
for (const version of entry?.versions ?? []) {
  const source = version.source ?? {}
  if (source.type === 'git') {
    check(/^[0-9a-f]{40}$/.test(source.commit ?? ''), `git commit is 40 lowercase hex (${version.version})`)
    check(typeof source.url === 'string' && source.url.startsWith('https://'),
      `git source uses https (${version.version})`)
  } else if (source.type === 'npm') {
    check(true, 'npm source')
  } else {
    failures.push(`unknown source type in ${version.version}: ${String(source.type)}`)
  }
}
if (typeof entry?.icon === 'string' && !entry.icon.startsWith('data:')) {
  check(await exists(join('site', entry.icon)), `index icon exists: site/${entry.icon}`)
}

if (failures.length > 0) {
  console.error(`manifest: ${failures.length} problem(s)`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(`manifest ok: ${pkg.name}@${pkg.version}, ${relativeNames.length} inserted file(s), ` +
  `${entry.versions.length} index version(s)`)
