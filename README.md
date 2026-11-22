<p align="center">
  <img src="icon.svg" width="76" height="76" alt="DeepSeek ASR" />
</p>

<h1 align="center">DeepSeek ASR for DeepSeek Harness</h1>

<p align="center">
  Speak into DSH and let DeepSeek's hosted ASR transcribe it — no local model download.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/NorwinYu/dsh-deepseek-asr" alt="License"></a>
  <a href="https://github.com/NorwinYu/dsh-deepseek-asr/tags"><img src="https://img.shields.io/github/v/tag/NorwinYu/dsh-deepseek-asr?sort=semver" alt="Latest release"></a>
  <a href="https://github.com/NorwinYu/dsh-deepseek-asr/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/NorwinYu/dsh-deepseek-asr/ci.yml?label=ci" alt="CI"></a>
  <a href="https://www.npmjs.com/package/dsh-deepseek-asr"><img src="https://img.shields.io/npm/v/dsh-deepseek-asr" alt="npm"></a>
  <a href="https://norwinyu.github.io/dsh-deepseek-asr/index.json"><img src="https://img.shields.io/badge/plugin%20index-live-4D6BFE" alt="Plugin index"></a>
  <img src="https://img.shields.io/badge/DSH-0.2.2--rc.1%20%E2%80%93%200.3-4D6BFE" alt="DSH version range">
</p>

---

DSH's Voice input bundle ships one recognizer: a local SenseVoice model that
must be downloaded (239 MB INT8, 938 MB FP32) and run on the Host CPU before the
first recording. This bundle keeps the microphone button, the recording bar, the
language and input-device settings, and the editable draft insertion — and
replaces the recognizer with a call to DeepSeek's hosted ASR endpoint.

One `POST /v1/tools/asr`, one transcript, nothing on disk.

## Table of Contents

- [Why](#why)
- [How it works](#how-it-works)
- [Requirements](#requirements)
- [Install](#install)
- [Usage](#usage)
- [Configuration](#configuration)
- [Privacy and billing](#privacy-and-billing)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Why

- **Nothing to download.** No model weights, no native runtime, no first-run
  preparation dialog. The recognizer is ready as soon as the Host loads it.
- **No CPU inference.** Recognition latency no longer competes with the agent or
  the rest of the machine.
- **Same interface.** The bundle contributes a provider, not a UI: the stock
  microphone, settings page, and draft flow all stay as they are.
- **Cheap at conversation length.** A few seconds of speech costs a fraction of
  a cent, and the key is one you may already use for chat.

## How it works

The bundle is a patch layer over the built-in Voice input bundle. It addresses
the rows that bundle already inserts and swaps only the recognizer:

```yaml
- id: speech-to-text              # point the shared registry at the cloud provider
  config:
    defaultProvider: deepseek-asr
- id: speech-to-text-sensevoice    # stop offering the local model download
  disabled: true
- insert:
    - id: speech-to-text-deepseek   # the provider shipped in lib/provider.mjs
      name: ./lib/provider.mjs
```

The provider:

1. registers on `ctx.speechToText` with `location: 'cloud'`, so the UI shows no
   install prompt and no download estimate;
2. declares no `preparation`, so it is ready the moment the service exists;
3. resolves `DEEPSEEK_API_KEY` per request through the credentials service,
   falling back to the launching environment;
4. forwards the browser's 16 kHz mono PCM16 WAV as `multipart/form-data` and
   returns `{ text, audioSeconds, inferenceSeconds }`.

Audio is held in memory for the request only. It never becomes a Session
attachment; only the transcript enters the conversation, after the user sends it.

## Requirements

- **DSH** `>=0.2.2-rc.1 <0.3.0`.
- The built-in **Voice input** bundle enabled
  (`@deepseek-ai/dsh-experimental-voice-input-bundle`). It provides the speech
  service, the `speech` Remote, and the microphone; this bundle only swaps the
  recognizer. Enable it **first** — see [Troubleshooting](#troubleshooting).
- A DeepSeek API key from <https://platform.deepseek.com>, stored under
  **Settings → Models** as `DEEPSEEK_API_KEY` or exported with that name.
  **The ASR endpoint is a paid API**: transcriptions are billed to that account,
  so it needs an available balance.

## Install

From the plugin index (recommended):

1. Enable **Custom plugin indexes** in the plugin manager.
2. Open **Discover → Add index source** and paste
   `https://norwinyu.github.io/dsh-deepseek-asr/index.json`.
3. Open **DeepSeek ASR** and install the listed version, then reload.

From npm:

```sh
dsh plugin --profile <name> add dsh-deepseek-asr@0.1.3
```

From a pinned Git release:

```sh
dsh plugin --profile <name> add git+https://github.com/NorwinYu/dsh-deepseek-asr.git#v0.1.3
```

The index lists both sources for the current version; the npm tarball is the same
code without the development-only files.

## Usage

The microphone sits between the model selector and the send button.

1. Click it and allow microphone access when asked.
2. Speak; the recording bar shows the live level.
3. Click stop. The transcript lands in the composer as editable text — review it
   before sending, or discard it.

Language and input device are chosen in the voice settings; the endpoint detects
the language itself, so `auto` is the default.

## Configuration

Every field is optional. Override them on the `speech-to-text-deepseek` row in
the profile's `cordis.patch.yml`:

```yaml
- id: speech-to-text-deepseek
  config:
    apiKeyEnv: DEEPSEEK_API_KEY
    requestTimeoutMs: 120000
```

| Field | Default | Meaning |
| --- | --- | --- |
| `providerId` | `deepseek-asr` | Registry id; must match `defaultProvider` on the `speech-to-text` row |
| `displayName` | `DeepSeek ASR` | Name shown in the voice settings |
| `endpoint` | `https://api.deepseek.com/v1/tools/asr` | Accepts 16-bit PCM WAV or Ogg Opus, up to 8 MiB and 120 s |
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | Credential name, resolved through the credentials service then the process environment |
| `apiKey` | none | Literal key; not recommended, it would land in a config file |
| `requestTimeoutMs` | `120000` | Per-request timeout |
| `statusPath` | none | Optional diagnostics file; omit to disable |

The upstream endpoint accepts 21 languages and detects them automatically.
DSH itself caps a recording at 120 seconds and 4 MiB, which fits inside the
endpoint's 8 MiB limit.

## Privacy and billing

**This is a paid DeepSeek API, not a free service.** Every recording that
reaches the endpoint is billed to the DeepSeek account that owns the key, per
hour of audio, at the rate published in the
[ASR documentation](https://api-docs.deepseek.com/guides/asr). Metering is to the
second, with sub-second audio rounded up to one second; one account may run at
most 50 concurrent requests, and calls fail once the balance is exhausted.
Quote prices from that page rather than from this README, since published rates
and promotions change.

- The recording leaves the machine and is sent to DeepSeek. There is no local
  transcription, offline mode, or fallback.
- The key is never bundled, logged, or written by this package.
- Audio is transient: held in memory for the request, never attached to a
  Session event.

If you need offline transcription, keep the built-in SenseVoice recognizer; both
can coexist in one profile if you point `defaultProvider` at one of them.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| No microphone button | Voice input bundle not enabled, or the provider failed to load. Both rows should be active in the plugin manager. |
| Prompt to install a SenseVoice model | Voice input was enabled *after* this bundle, so its patch layer ran last and restored `defaultProvider: sensevoice-local`. Enable Voice input first, then this bundle, or move `dsh-deepseek-asr` after it in `dsh.profile.bundles`. |
| `No DEEPSEEK_API_KEY configured` | Store the key under **Settings → Models**, or export it in the launching environment. |
| HTTP 400 | Audio format rejected: the endpoint wants 16-bit PCM WAV or Ogg Opus. |
| HTTP 401 / 403 | The key is missing, invalid, expired, or not allowed to call ASR. |
| HTTP 429 | More than 50 concurrent requests on the account. |
| HTTP 503 / 504 | Service side; retry. |
| No transcript, no error | Set `statusPath` and check `phase`: `registered`, `ok` (with `requestId`), `failed`, `disposed`. |

The diagnostics file never contains the key or the audio — only the phase, the
HTTP status, and the transcript length.

## Development

The repository is the package; there is no build step.

```sh
git clone https://github.com/NorwinYu/dsh-deepseek-asr
cd dsh-deepseek-asr
node test/manifest.mjs          # structural checks, no network
```

End-to-end smoke test against the live endpoint (needs a stored key):

```sh
say -v Ting-Ting "Shanghai weather today" -o /tmp/t.aiff
afconvert -f WAVE -d LEI16@16000 -c 1 /tmp/t.aiff /tmp/t.wav
node test/smoke.mjs /tmp/t.wav
```

It stubs the plugin context, resolves the key the same way the Host does, and
prints the transcript result. Publishing and index maintenance are documented in
[PUBLISHING.md](PUBLISHING.md).

## Contributing

Issues and pull requests are welcome. Please keep the surface small: this bundle
owns one recognizer and nothing else. See [CONTRIBUTING.md](CONTRIBUTING.md) for
the checks a change has to pass, and never commit an API key or a recording.

## License

[MIT](LICENSE)

## Disclaimer

A third-party plugin, not affiliated with DeepSeek. "DeepSeek" refers to the
API this plugin calls; any trademarks belong to their owners.
