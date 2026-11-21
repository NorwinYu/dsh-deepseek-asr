/**
 * Standalone smoke test for the DeepSeek ASR provider.
 *
 * Usage: node test/smoke.mjs /path/to/16k-mono.wav
 * Reads DEEPSEEK_API_KEY exactly like the host does (credentials store first,
 * then the process environment) and calls transcribe() with a stub context.
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const wavPath = process.argv[2]
if (!wavPath) {
  console.error('usage: node test.mjs <16k-mono-pcm16.wav>')
  process.exit(2)
}

const here = dirname(fileURLToPath(import.meta.url))

/** Best-effort read of the credential store used by the local provider. */
async function storedKey(ref) {
  try {
    const store = join(process.env.DSH_HOME ?? join(process.env.HOME ?? '', '.dsh'), '.credentials.yaml')
    const yaml = await readFile(store, 'utf8')
    const match = new RegExp(`^\\s+${ref}:\\s*['"]?([^'"\\n]+)['"]?\\s*$`, 'm').exec(yaml)
    return match?.[1]?.trim()
  } catch {
    return undefined
  }
}

const ref = 'DEEPSEEK_API_KEY'
const apiKey = (await storedKey(ref)) ?? process.env[ref]
if (!apiKey) {
  console.error(`no ${ref}: export it or store it through the credentials service`)
  process.exit(2)
}

let registered
const ctx = {
  get: (service) => service === 'credentials'
    ? { resolve: async (name) => (name === ref ? { value: apiKey, source: 'test' } : undefined) }
    : undefined,
  effect: (run) => run(),
  speechToText: {
    register: (provider) => {
      registered = provider
      return async () => {}
    },
    listProviders: () => (registered ? [registered.info] : []),
  },
}

const { apply } = await import(join(here, '..', 'lib', 'provider.mjs'))
apply(ctx, {})

console.log('provider:', registered.info.id, '| location:', registered.info.location,
  '| languages:', registered.info.languages.length)

const audio = await readFile(wavPath)
const started = Date.now()
const result = await registered.transcribe({ audio, language: 'auto' }, undefined)
console.log(`transcript (${Date.now() - started} ms):`, JSON.stringify(result))
for (const field of ['text', 'audioSeconds', 'inferenceSeconds']) {
  if (result?.[field] === undefined) {
    console.error(`missing ${field}: the Remote contract requires { text, audioSeconds, inferenceSeconds }`)
    process.exit(1)
  }
}
