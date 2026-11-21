/**
 * DeepSeek ASR speech-to-text provider for DeepSeek Harness.
 *
 * Registers a cloud recognizer on `ctx.speechToText`, so the stock microphone
 * UI (packages/experimental/client-ui-voice-input) can send recordings to
 * `POST https://api.deepseek.com/v1/tools/asr` instead of a local model.
 *
 * The browser side already records 16 kHz mono PCM16 WAV, which is exactly what
 * the endpoint accepts, so no transcoding happens here.
 *
 * All user-visible text in this file is English on purpose: error messages
 * surface verbatim in the chat UI and in `status.json`.
 */

import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** Stable loader entry name. */
export const name = 'speech-to-text-deepseek'

/** The registry must exist before registration. */
export const inject = ['speechToText']

const DEFAULT_ENDPOINT = 'https://api.deepseek.com/v1/tools/asr'

/** Languages the endpoint accepts; it detects the language itself. */
const LANGUAGES = [
  'auto', 'zh', 'yue', 'en', 'ja', 'ko', 'de', 'fr', 'es', 'pt',
  'it', 'ru', 'ar', 'hi', 'id', 'vi', 'th', 'tr', 'ms', 'fil',
  'pl', 'hu',
]

/** Upstream hard limits, enforced again here for direct callers. */
const MAX_AUDIO_BYTES = 8 * 1024 * 1024
const MAX_DURATION_SECONDS = 120

function plainConfig(raw) {
  const value = raw ?? {}
  const number = (candidate, fallback) =>
    typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0 ? candidate : fallback
  return {
    providerId: typeof value.providerId === 'string' && value.providerId ? value.providerId : 'deepseek-asr',
    displayName: typeof value.displayName === 'string' && value.displayName ? value.displayName : 'DeepSeek ASR',
    endpoint: typeof value.endpoint === 'string' && value.endpoint ? value.endpoint : DEFAULT_ENDPOINT,
    apiKeyEnv: typeof value.apiKeyEnv === 'string' && value.apiKeyEnv ? value.apiKeyEnv : 'DEEPSEEK_API_KEY',
    apiKey: typeof value.apiKey === 'string' && value.apiKey ? value.apiKey : undefined,
    requestTimeoutMs: number(value.requestTimeoutMs, 120_000),
    statusPath: typeof value.statusPath === 'string' && value.statusPath ? value.statusPath : undefined,
  }
}

/** WAV duration from the canonical 44-byte PCM16 header, when it parses. */
function wavSeconds(audio) {
  if (audio.length < 44 || audio.toString('ascii', 0, 4) !== 'RIFF') return undefined
  const byteRate = audio.readUInt32LE(28)
  if (!byteRate) return undefined
  return (audio.length - 44) / byteRate
}

async function resolveApiKey(ctx, config) {
  if (config.apiKey !== undefined) return config.apiKey
  const credentials = ctx.get?.('credentials')
  if (credentials !== undefined && typeof credentials.resolve === 'function') {
    const hit = await credentials.resolve(config.apiKeyEnv)
    if (hit !== undefined && typeof hit.value === 'string' && hit.value.length > 0) return hit.value
  }
  const ambient = process.env[config.apiKeyEnv]
  if (typeof ambient === 'string' && ambient.length > 0) return ambient
  throw new Error(
    `No ${config.apiKeyEnv} configured. Store a DeepSeek API key under Settings -> Models, ` +
    `or export ${config.apiKeyEnv} in the launching environment.`,
  )
}

/** Whether a key is reachable, without reading its value. */
async function describeKey(ctx, config) {
  if (config.apiKey !== undefined) return true
  const credentials = ctx.get?.('credentials')
  if (credentials !== undefined && typeof credentials.describe === 'function') {
    try {
      const info = await credentials.describe(config.apiKeyEnv)
      if (info?.configured === true) return true
    } catch {
      // Fall through to the ambient environment.
    }
  }
  return typeof process.env[config.apiKeyEnv] === 'string' && process.env[config.apiKeyEnv].length > 0
}

/** One short, value-free line from an error response body. */
function describeFailure(body) {
  const text = body.trim()
  if (text.length === 0) return ''
  try {
    const parsed = JSON.parse(text)
    const message = parsed?.error?.message ?? parsed?.message
    if (typeof message === 'string') return message.slice(0, 300)
  } catch {
    // Not JSON: keep the raw excerpt.
  }
  return text.slice(0, 300)
}

function statusHint(status) {
  switch (status) {
    case 400: return 'audio is not 16-bit PCM WAV or Ogg Opus'
    case 401: return 'the API key is missing, invalid, or expired'
    case 403: return 'the API key may not call speech recognition'
    case 408: return 'the upload exceeded the 10 minute window'
    case 413: return 'the audio is larger than 8 MiB'
    case 429: return 'too many concurrent requests for this account'
    case 503: return 'the service is busy, retry shortly'
    case 504: return 'recognition timed out'
    default: return undefined
  }
}

/** DeepSeek ASR recognizer: one request per recording, whole transcript back. */
function createRecognizer(ctx, config, writeStatus) {
  const transcribe = async (input, signal) => {
    const audio = input?.audio
    if (!(audio instanceof Uint8Array) || audio.length === 0) {
      throw new Error('DeepSeek ASR received empty audio')
    }
    if (audio.length > MAX_AUDIO_BYTES) {
      throw new Error(`Audio is ${audio.length} bytes, over the 8 MiB DeepSeek ASR limit`)
    }
    const seconds = wavSeconds(audio)
    if (seconds !== undefined && seconds > MAX_DURATION_SECONDS + 1) {
      throw new Error(`Audio is about ${Math.round(seconds)} s, over the 120 s DeepSeek ASR limit`)
    }

    const started = Date.now()
    const apiKey = await resolveApiKey(ctx, config)
    const form = new FormData()
    form.append('file', new Blob([audio], { type: 'audio/wav' }), 'speech.wav')

    const timeout = AbortSignal.timeout(config.requestTimeoutMs)
    const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout])

    let response
    try {
      response = await fetch(config.endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}` },
        body: form,
        signal: combined,
      })
    } catch (error) {
      if (signal?.aborted) {
        await writeStatus({ phase: 'cancelled' })
        throw new Error('DeepSeek ASR request cancelled')
      }
      if (error?.name === 'TimeoutError') {
        await writeStatus({ phase: 'failed', reason: 'timeout' })
        throw new Error(`DeepSeek ASR did not respond within ${config.requestTimeoutMs} ms`)
      }
      await writeStatus({ phase: 'failed', reason: 'network' })
      throw new Error(`DeepSeek ASR network request failed: ${error?.message ?? String(error)}`)
    }

    const body = await response.text()
    if (!response.ok) {
      const detail = describeFailure(body)
      await writeStatus({ phase: 'failed', status: response.status })
      const hint = statusHint(response.status)
      throw new Error(
        `DeepSeek ASR returned ${response.status}${hint === undefined ? '' : ` (${hint})`}` +
        (detail ? `: ${detail}` : ''),
      )
    }

    let payload
    try {
      payload = JSON.parse(body)
    } catch {
      await writeStatus({ phase: 'failed', reason: 'protocol' })
      throw new Error('DeepSeek ASR returned a response that is not JSON')
    }
    const text = payload?.text
    if (typeof text !== 'string') {
      await writeStatus({ phase: 'failed', reason: 'protocol' })
      throw new Error('DeepSeek ASR response is missing the text field')
    }
    const audioSeconds = seconds ?? (typeof payload?.duration_ms === 'number' ? payload.duration_ms / 1000 : 0)
    const inferenceSeconds = (Date.now() - started) / 1000
    await writeStatus({
      phase: 'ok',
      characters: text.length,
      durationMs: payload?.duration_ms,
      requestId: payload?.request_id,
    })
    // The Remote contract is {@link TranscriptResult}: a bare string would fail
    // result decoding on the way back to the browser.
    return { text, audioSeconds, inferenceSeconds }
  }

  return { transcribe }
}

export function apply(ctx, rawConfig) {
  const config = plainConfig(rawConfig)

  let statusChain = Promise.resolve()
  const writeStatus = (patch) => {
    if (config.statusPath === undefined) return Promise.resolve()
    const record = {
      updatedAt: new Date().toISOString(),
      providerId: config.providerId,
      endpoint: config.endpoint,
      ...patch,
    }
    statusChain = statusChain.then(async () => {
      const temp = `${config.statusPath}.${process.pid}.tmp`
      try {
        await mkdir(dirname(config.statusPath), { recursive: true })
        await writeFile(temp, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
        await rename(temp, config.statusPath)
      } catch (error) {
        console.warn('[speech-to-text-deepseek] status write failed:', error?.message ?? error)
      }
    })
    return statusChain
  }

  const recognizer = createRecognizer(ctx, config, writeStatus)
  void writeStatus({ phase: 'applying' })

  ctx.effect(() => {
    let dispose
    try {
      dispose = ctx.speechToText.register({
        info: {
          id: config.providerId,
          name: config.displayName,
          location: 'cloud',
          languages: LANGUAGES,
        },
        transcribe: recognizer.transcribe,
      })
    } catch (error) {
      void writeStatus({ phase: 'register-failed', error: String(error?.message ?? error) })
      throw error
    }
    void writeStatus({
      phase: 'registered',
      providers: ctx.speechToText.listProviders().map((provider) => provider.id),
    })
    void describeKey(ctx, config).then((configured) => writeStatus({ phase: 'registered', keyConfigured: configured }))
    return async () => {
      await dispose()
      void writeStatus({ phase: 'disposed' })
    }
  })
}
