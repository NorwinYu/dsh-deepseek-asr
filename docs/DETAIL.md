# DeepSeek ASR for DeepSeek Harness

Stop paying for disk and RAM you do not need. The built-in Voice input bundle
ships one recognizer, a local SenseVoice model that has to be downloaded before
the first recording. This bundle keeps the same microphone, the same settings
page, and the same transcript flow, but sends the recording to DeepSeek's
hosted ASR endpoint instead.

## What you get

- **No model download.** Nothing is fetched, cached, or loaded locally. The
  microphone is ready immediately.
- **The stock experience.** Same button, same recording bar, same editable
  draft insertion, same language and input-device settings.
- **Live key rotation.** The API key is read on every recording, so changing it
  under Settings takes effect on the next take.

## What it changes

One row, effectively. The bundle points the shared speech registry at a new
cloud recognizer and disables the local model row so nothing offers a download:

```yaml
- id: speech-to-text
  config:
    defaultProvider: deepseek-asr
- id: speech-to-text-sensevoice
  disabled: true
- insert:
    - id: speech-to-text-deepseek
      name: ./lib/provider.mjs
```

## What it costs

**DeepSeek ASR is a paid API.** Every transcription is billed to the DeepSeek
account behind the key, per hour of audio, at the published rate on the
[ASR documentation](https://api-docs.deepseek.com/guides/asr). Calls are metered
against the account's balance and are rejected once it is exhausted. Metering is
to the second, rounding sub-second audio up to one second, and one account may
run at most 50 concurrent requests.

The audio also leaves your machine. If you need offline transcription, keep the
built-in SenseVoice recognizer instead; both can coexist in a profile if you
point `defaultProvider` at one of them.

## Before you install

1. Enable the built-in **Voice input** bundle.
2. Store a DeepSeek API key as `DEEPSEEK_API_KEY` under **Settings -> Models**.
3. Install this bundle and reload.

Then click the microphone between the model selector and the send button, speak,
and click again. The transcript appears in the composer, editable, and nothing
is sent until you send it.
