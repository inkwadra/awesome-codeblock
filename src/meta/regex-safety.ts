/**
 * Static check for regex markers that can backtrack catastrophically.
 *
 * A marker's regex runs on every line, on the renderer's main thread, and a
 * running `RegExp` cannot be interrupted: `/(a+)+$/` on thirty characters
 * freezes the app for seconds, on every render. So the classic shape is refused
 * before it runs — a repeated group whose body can match the same text in
 * several ways:
 *
 *     (a+)+   (\w+\s*)*   (a?a?)+   (.*,)+
 *
 * A repeated group is fine when every pass through it is pinned by a literal
 * that its variable-length parts cannot match, at the same end of each branch:
 *
 *     (\d+\.)+   (,\s*\w+)*   (\w+::)*
 *
 * This is a heuristic, not a proof. Alternations of fixed overlapping strings
 * (`(a|aa)+`) and merely polynomial patterns (`\s*\s*\s*x`) pass; the time
 * budget in `inline-markers.ts` bounds what those can cost over a block.
 */

interface Quantifier {
  min: number
  max: number
}

type Node =
  | { kind: 'literal'; char: string; q: Quantifier }
  /** Anything else that consumes text: `.`, `\w`, `[a-z]`, `\n`, a backreference. */
  | { kind: 'class'; source: string; q: Quantifier }
  | { kind: 'group'; branches: Node[][]; q: Quantifier }
  /** Zero width: `^`, `$`, `\b`, lookarounds. */
  | { kind: 'assert'; branches: Node[][] }

const ONCE: Quantifier = { min: 1, max: 1 }

/** Repetitions from which a group counts as repeated without bound. */
const MANY = 16

const QUANTIFIER = /^\{(\d+)(?:(,)(\d*))?\}/

class Parser {
  private i = 0

  constructor(private readonly src: string) {}

  /** Branches up to the closing `)` or the end. */
  alternation(): Node[][] {
    const branches: Node[][] = [[]]
    while (this.i < this.src.length && this.src[this.i] !== ')') {
      if (this.src[this.i] === '|') {
        this.i++
        branches.push([])
        continue
      }
      const node = this.atom()
      const q = this.quantifier()
      branches.at(-1)!.push(node.kind === 'assert' ? node : { ...node, q })
    }
    return branches
  }

  private atom(): Node {
    const { src } = this
    const start = this.i
    const ch = src[this.i++]!
    if (ch === '^' || ch === '$') return { kind: 'assert', branches: [] }
    if (ch === '.') return { kind: 'class', source: '.', q: ONCE }
    if (ch === '[') {
      while (this.i < src.length && src[this.i] !== ']') this.i += src[this.i] === '\\' ? 2 : 1
      this.i++
      return { kind: 'class', source: src.slice(start, this.i), q: ONCE }
    }
    if (ch === '(') {
      const prefix = /^\?(?:[:=!]|<[=!]|<[^>]*>)/.exec(src.slice(this.i))?.[0] ?? ''
      this.i += prefix.length
      const branches = this.alternation()
      this.i++ // ")"
      const lookaround = prefix === '?=' || prefix === '?!' || prefix === '?<=' || prefix === '?<!'
      return lookaround ? { kind: 'assert', branches } : { kind: 'group', branches, q: ONCE }
    }
    if (ch === '\\') return this.escape(start)
    return { kind: 'literal', char: ch, q: ONCE }
  }

  private escape(start: number): Node {
    const { src } = this
    const ch = src[this.i++]
    if (ch === undefined) return { kind: 'literal', char: '\\', q: ONCE }
    if (ch === 'b' || ch === 'B') return { kind: 'assert', branches: [] }
    // An escaped punctuation character stands for itself.
    if (!/[A-Za-z0-9]/.test(ch)) return { kind: 'literal', char: ch, q: ONCE }
    const rest = src.slice(this.i)
    const tail =
      ch === 'p' || ch === 'P' || ch === 'u'
        ? (/^\{[^}]*\}/.exec(rest) ?? (ch === 'u' ? /^[0-9a-fA-F]{4}/.exec(rest) : null))
        : ch === 'k'
          ? /^<[^>]*>/.exec(rest)
          : ch === 'x'
            ? /^[0-9a-fA-F]{2}/.exec(rest)
            : ch === 'c'
              ? /^[A-Za-z]/.exec(rest)
              : /[1-9]/.test(ch)
                ? /^\d*/.exec(rest)
                : null
    this.i += tail?.[0].length ?? 0
    return { kind: 'class', source: src.slice(start, this.i), q: ONCE }
  }

  private quantifier(): Quantifier {
    const { src } = this
    const ch = src[this.i]
    let q: Quantifier
    if (ch === '*') q = { min: 0, max: Infinity }
    else if (ch === '+') q = { min: 1, max: Infinity }
    else if (ch === '?') q = { min: 0, max: 1 }
    else {
      const m = ch === '{' ? QUANTIFIER.exec(src.slice(this.i)) : null
      if (!m) return ONCE
      const min = Number(m[1])
      q = { min, max: m[2] ? (m[3] ? Number(m[3]) : Infinity) : min }
      this.i += m[0].length - 1
    }
    this.i++
    if (src[this.i] === '?') this.i++ // lazy
    return q
  }
}

type Leaf = Extract<Node, { kind: 'literal' | 'class' }>

const isFlexible = (q: Quantifier) => q.min !== q.max

/**
 * The text-consuming leaves of `branches` whose match can vary in length:
 * leaves with a variable quantifier, and every leaf under a group that has
 * one or that offers alternatives.
 */
function flexibleLeaves(branches: readonly Node[][], inherited = false): Leaf[] {
  const out: Leaf[] = []
  for (const node of branches.flat()) {
    if (node.kind === 'assert') continue
    if (node.kind === 'group') {
      out.push(...flexibleLeaves(node.branches, inherited || isFlexible(node.q) || node.branches.length > 1))
    } else if (inherited || isFlexible(node.q)) out.push(node)
  }
  return out
}

/** Whether `leaf` can match the single character `char`. Unknown counts as yes. */
function canMatch(leaf: Leaf, char: string, flags: string): boolean {
  if (leaf.kind === 'literal') {
    return flags.includes('i') ? leaf.char.toLowerCase() === char.toLowerCase() : leaf.char === char
  }
  try {
    return new RegExp(`^(?:${leaf.source})$`, flags).test(char)
  } catch {
    return true
  }
}

/** A literal matched exactly as written a fixed number of times, at one end of a branch. */
function delimiterOf(branch: readonly Node[], end: 'first' | 'last'): string | undefined {
  const terms = branch.filter(node => node.kind !== 'assert')
  const node = end === 'first' ? terms[0] : terms.at(-1)
  return node?.kind === 'literal' && node.q.min >= 1 && !isFlexible(node.q) ? node.char : undefined
}

/** True if text can be divided between passes through the repeated `group` in more than one way. */
function isAmbiguous(group: Extract<Node, { kind: 'group' }>, flags: string): boolean {
  const flexible = flexibleLeaves(group.branches)
  if (flexible.length === 0) return false
  const pinnedAt = (end: 'first' | 'last') =>
    group.branches.every(branch => {
      const char = delimiterOf(branch, end)
      return char !== undefined && !flexible.some(leaf => canMatch(leaf, char, flags))
    })
  return !pinnedAt('first') && !pinnedAt('last')
}

function hasAmbiguousRepetition(branches: readonly Node[][], flags: string): boolean {
  return branches.flat().some(node => {
    if (node.kind !== 'group' && node.kind !== 'assert') return false
    if (node.kind === 'group' && node.q.max >= MANY && isAmbiguous(node, flags)) return true
    return hasAmbiguousRepetition(node.branches, flags)
  })
}

/**
 * True if the (valid) regex `source` has a repeated group that can backtrack
 * catastrophically. `flags` are the user's, as passed to `RegExp`.
 */
export function isCatastrophicRegex(source: string, flags = ''): boolean {
  try {
    return hasAmbiguousRepetition(new Parser(source).alternation(), flags)
  } catch {
    // Not understood: let it run, within the time budget.
    return false
  }
}
