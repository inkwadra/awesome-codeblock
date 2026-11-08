# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.4] - 2026-11-08

### Fixed

- Fix indent guides disappearing in blocks with word wrap turned on (`wrap` or the **Wrap long lines** setting).
- Fix indent guides on wrapped lines stopping at the first row; they now continue down the wrapped continuation rows.
- Fix indent guides on blank lines being drawn at the wrong position instead of lining up with the surrounding code.

## [0.8.3] - 2026-11-06

### Added

- Add Shiki syntax highlighting for 242 languages and 65 themes, with separate light and dark themes and automatic
  matching of the active Inkdrop theme to the Shiki theme of the same name.
- Add a code block header with a file-type icon, the title or language name, an optional link, and copy and wrap
  buttons.
- Add block titles via `title=`, `filename=` or `[name]`, and use a file-name comment in the first lines of the code
  as the title when a block has none (`extractFileName`).
- Add line markers (`{…}`, `mark=`, `ins=`, `del=`) with optional labels, and inline markers for quoted text and
  regular expressions.
- Add support for Shiki notation comments: `[!code ++]`, `[!code --]`, `[!code highlight]`, `[!code focus]`,
  `[!code error]`, `[!code warning]`, `[!code info]` and `[!code word:…]`.
- Add diff views for real patches in unified, split or classic layout with word-level changes, plus `+`/`-` line
  marking for hand-written diffs (`useDiffSyntax`).
- Add collapsible sections (`collapse=`) with four toggle styles, and a maximum height (`maxLines=`) with a
  "Show all N lines" button.
- Add tabbed groups of adjacent blocks (`tab=`, `group=`) whose selection syncs across notes and is remembered
  between sessions.
- Add line numbers, word wrap with preserved or hanging indent, indent guides and a configurable tab size.
- Add editor completion on fence lines for languages, meta options and their values, and for `[!code …]` notations
  inside the code.
- Add support for Inkdrop's own code block options (`title=`, `url=`, `line=`, `branch=`, `commit=`).
- Add settings for themes, per-block defaults, header buttons, ignored languages and language aliases.
- Add export- and print-friendly rendering: tabs, cut blocks and diff views print as static, complete code.

[unreleased]: https://github.com/inkwadra/awesome-codeblock/compare/v0.8.4...HEAD
[0.8.4]: https://github.com/inkwadra/awesome-codeblock/compare/v0.8.3...v0.8.4
[0.8.3]: https://github.com/inkwadra/awesome-codeblock/releases/tag/v0.8.3
