---
description: "Cloud speech-to-text for Voice input through the DeepSeek ASR API."
kind: "package-bundle"
---

# dsh-deepseek-asr

Use DSH's microphone with DeepSeek's hosted speech recognition instead of a
local model. Recordings go to `POST https://api.deepseek.com/v1/tools/asr`;
nothing is downloaded and nothing is transcribed on the machine.

## Requirements

- DSH `0.2.2-rc.1` or newer within `0.3.0`.
- The built-in **Voice input** bundle enabled
  (`@deepseek-ai/dsh-experimental-voice-input-bundle`). It provides the speech
  service, the `speech` Remote, and the microphone button; this bundle only
  replaces the recognizer, so the microphone settings page keeps working.
- A DeepSeek API key from <https://platform.deepseek.com>, stored under
  **Settings -> Models** as `DEEPSEEK_API_KEY` or exported with that name.
  **The ASR endpoint is a paid API**: every transcription is billed to that
  account, so it needs an available balance. There is no local fallback.

Enable Voice input first, then this bundle. Both layers are ordered by the
profile's bundle list, so the provider swap always applies last.

## Install

The bundle is distributed from GitHub through a plugin index; there is no npm
package yet.

1. Enable **Custom plugin indexes** in the plugin manager.
2. Open **Discover -> Add index source** and paste
   `https://norwinyu.github.io/dsh-deepseek-asr/index.json`.
3. Open **DeepSeek ASR**, install the listed version, then reload.

Without the index, install the pinned commit directly:

```sh
dsh plugin --profile <name> add git+https://github.com/NorwinYu/dsh-deepseek-asr.git#v0.1.1
```

Releases are pinned to a commit in the index, so upgrading means installing the
newer listed version rather than pulling whatever the branch holds.

Then reload. The microphone sits between the model selector and the send
button: click to record, click again to stop, and the transcript lands in the
composer for review before sending.

## Configuration

Every field is optional. Override them on the `speech-to-text-deepseek` row in
the profile's `cordis.patch.yml`:

| Field | Default | Meaning |
|---|---|---|
| `providerId` | `deepseek-asr` | Registry id; must match `defaultProvider` on the `speech-to-text` row |
| `displayName` | `DeepSeek ASR` | Name shown in the voice settings |
| `endpoint` | `https://api.deepseek.com/v1/tools/asr` | Accepts 16-bit PCM WAV or Ogg Opus, up to 8 MiB and 120 s |
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | Credential name; resolved through the credentials service, then the process environment |
| `apiKey` | none | Literal key; not recommended, it lands in a config file |
| `requestTimeoutMs` | `120000` | Per-request timeout |
| `statusPath` | none | Optional diagnostics file; omit to disable |

The browser records 16 kHz mono PCM16 WAV, which is exactly what the endpoint
accepts, so audio is forwarded without transcoding. The key is read again on
every recording, so rotating it takes effect without a restart.

## Privacy and cost

**This is a paid DeepSeek API, not a free service.** Every recording that
reaches the endpoint is billed to the DeepSeek account that owns the key,
per hour of audio, at the rate published on the
[ASR documentation](https://api-docs.deepseek.com/guides/asr); billing is
metered to the second, with sub-second audio rounded up to one second. Calls
fail once the balance is exhausted or the account exceeds 50 concurrent
requests. Quote prices from that page rather than from this README, since
published rates and promotions change.

- The recording leaves the machine and is sent to DeepSeek. There is no local
  transcription, offline mode, or fallback.
- The key is never bundled and never written by this package; it is read from
  the credentials service or the launching environment at request time.
- Recordings are transient: DSH holds them in memory for the request and does
  not attach them to the Session. Only the transcript enters the conversation,
  after the user sends it.

## How it works

This package contributes one host plugin, `lib/provider.mjs`. It registers a
recognizer with `location: 'cloud'` on `ctx.speechToText` and returns
`{ text, audioSeconds, inferenceSeconds }`, the shape every consumer expects.
Because the provider declares no preparation, the microphone is ready as soon
as the service exists.

## Troubleshooting

- No microphone: the Voice input bundle is not enabled, or the provider failed
  to load. Check the plugin manager for both rows.
- The microphone asks to install a SenseVoice model: the Voice input bundle was
  enabled *after* this one, so its patch layer ran later and restored
  `defaultProvider: sensevoice-local`. Enable Voice input first, then this
  bundle, or move `dsh-deepseek-asr` after it in the profile's
  `dsh.profile.bundles`.
- `No DEEPSEEK_API_KEY configured`: store the key under Settings -> Models.
- HTTP 400 means the audio format was rejected; 401/403 means the key; 429
  means too many concurrent requests; 503/504 means the service side, retry.
- With `statusPath` set, the file records `phase` (`registered`, `ok` with
  `requestId` and `durationMs`, `failed` with an HTTP status, `disposed`). It
  never contains the key.

## Development

```sh
say -v Ting-Ting "Shanghai weather today" -o /tmp/t.aiff
afconvert -f WAVE -d LEI16@16000 -c 1 /tmp/t.aiff /tmp/t.wav
npm test -- /tmp/t.wav
```

The smoke test stubs the plugin context, reads the stored key the same way the
host does, and calls `transcribe()` against the real endpoint.

## License

MIT.
