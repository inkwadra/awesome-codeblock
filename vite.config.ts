import { defineConfig } from 'vite-plus'
import { diffsBuild } from './scripts/diffs-build.mjs'

export default defineConfig({
  // Vite / Vitest plugins (`vp test`).
  plugins: [diffsBuild()],

  // tsdown (`vp pack`): the plugin bundle in lib/.
  pack: {
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: ['cjs'],
    minify: true,
    sourcemap: process.argv.includes('--watch'),
    clean: true,
    outExtensions: () => ({ js: '.js' }),
    treeshake: true,
    plugins: [diffsBuild()],
    deps: {
      // Provided by Inkdrop at runtime.
      neverBundle: ['react', 'react/jsx-runtime', 'inkdrop', 'event-kit', 'inkdrop-model', 'react-redux']
    }
  },

  // Vitest (`vp test`).
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Transform diffs so the diffs build plugins also apply in tests.
    server: { deps: { inline: [/@pierre[\\/]diffs/] } }
  },

  // Oxfmt (`vp fmt`), matching the project's existing style.
  fmt: {
    semi: false,
    singleQuote: true,
    trailingComma: 'none',
    arrowParens: 'avoid',
    printWidth: 120,
    sortPackageJson: false,
    ignorePatterns: [
      'lib/**',
      'src/icons/*.generated.ts',
      'pnpm-lock.yaml',
      // Markdown is left as written: README's fence examples are content.
      '**/*.md',
      // Vendored agent skills.
      '.agents/**',
      '.claude/**'
    ]
  },

  // Oxlint (`vp lint`), with type checking through tsgolint.
  lint: {
    ignorePatterns: ['lib/**', 'src/icons/*.generated.ts'],
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true }
  },

  // Pre-commit hook (`vp staged`).
  staged: {
    '*': 'vp check --fix'
  }
})
