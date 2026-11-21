# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `test/manifest.mjs`: structural checks for the bundle (declared patch, existing
  referenced files, patch/provider agreement, locale metadata, index/package
  version agreement).
- CI workflow running those checks, a syntax pass, and the official index
  validator on every push and pull request.
- `CONTRIBUTING.md` and this changelog.

### Changed

- README rewritten as a project page: badges, table of contents, install paths,
  usage, configuration table, billing and privacy statements, troubleshooting
  matrix, and development notes.

## [0.1.1] - 2026-11-21

### Added

- Documentation for the bundle-order requirement: the built-in Voice input
  bundle must be enabled before this one, or its patch layer restores the local
  recognizer.

### Changed

- The manual install command now pins the release tag instead of the branch.

## [0.1.0] - 2026-11-21

### Added

- Cloud speech-to-text provider registered on `ctx.speechToText` with
  `location: 'cloud'` and no preparation step.
- Provider swap over the built-in Voice input bundle: `defaultProvider` points
  at `deepseek-asr` and the local SenseVoice row is disabled.
- Per-request API key resolution through the credentials service, with an
  environment fallback.
- `statusPath` diagnostics for phases, HTTP status, and transcript length.
- Plugin index published on GitHub Pages, with a workflow that validates the
  index before deploying it.

[Unreleased]: https://github.com/NorwinYu/dsh-deepseek-asr/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/NorwinYu/dsh-deepseek-asr/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/NorwinYu/dsh-deepseek-asr/releases/tag/v0.1.0
