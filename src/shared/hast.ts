import type { Element, ElementContent, Properties, RootContent } from 'hast'

/** Small hast helpers shared by the rehype plugin and the Shiki transformers. */

export function h(tagName: string, properties: Properties = {}, children: ElementContent[] = []): Element {
  return { type: 'element', tagName, properties, children }
}

export function isElement(node: RootContent | ElementContent | undefined): node is Element {
  return node?.type === 'element'
}

/** Shiki writes `class` (string) while hast utilities use `className` (array): reads both. */
export function classList(node: Element): string[] {
  const out = new Set<string>()
  for (const value of [node.properties?.className, node.properties?.class]) {
    if (Array.isArray(value)) for (const c of value) out.add(String(c))
    else if (typeof value === 'string') for (const c of value.split(/\s+/)) if (c) out.add(c)
  }
  return [...out]
}

export function hasClass(node: Element, name: string): boolean {
  return classList(node).includes(name)
}

/** Adds classes, normalizing `class` / `className` into `className`. */
export function addClass(node: Element, ...names: string[]): void {
  const list = classList(node)
  for (const name of names) if (!list.includes(name)) list.push(name)
  const { class: _class, className: _className, ...rest } = node.properties ?? {}
  node.properties = { ...rest, className: list }
}

export function textContent(node: ElementContent): string {
  if (node.type === 'text') return node.value
  if (node.type === 'element') return node.children.map(textContent).join('')
  return ''
}

/** A hast property as a string, or `undefined` when absent. */
export function propertyString(value: unknown): string | undefined {
  if (Array.isArray(value)) return value.join(' ')
  if (typeof value === 'string') return value
  if (typeof value === 'number' || value === true) return String(value)
  return undefined
}
