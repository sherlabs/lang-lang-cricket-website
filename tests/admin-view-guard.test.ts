import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { registeredViews } from '../payload/admin/views'

/**
 * The view registry and the staff guard (wave G WP-5). `payload/admin/views.ts` lists every custom view; this test keeps it in step
 * with `payload.config.ts` and checks, on the syntax tree, that each view's exported function calls `requireStaff(...)` and returns
 * its result before reading anything else. It replaces a text search for `req.user`, which a rename or a comment could dodge.
 */
const root = path.resolve(__dirname, '..')
const config = fs.readFileSync(path.join(root, 'payload.config.ts'), 'utf8')
const inConfig = [...config.matchAll(/(\w+):\s*\{\s*Component:\s*'\/payload\/components\/(\w+)#(\w+)'/g)].map((m) => ({ key: m[1], file: m[2], component: m[3] }))

function exportedFunction(file: string, name: string): ts.FunctionDeclaration | null {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let found: ts.FunctionDeclaration | null = null
  source.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) found = node
  })
  return found
}

/** The first statement that calls `requireStaff(` and whether anything before it awaits something else. */
function gateInfo(fn: ts.FunctionDeclaration): { index: number; awaitsBefore: boolean; returnsDenied: boolean } {
  const statements = fn.body?.statements ?? []
  let awaitsBefore = false
  for (let i = 0; i < statements.length; i++) {
    let hasGate = false
    let awaits = false
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'requireStaff') hasGate = true
      else if (ts.isAwaitExpression(n)) awaits = true
      ts.forEachChild(n, visit)
    }
    visit(statements[i])
    if (hasGate) {
      const next = statements[i + 1]
      const returnsDenied = next !== undefined && ts.isIfStatement(next) && /denied\s*!==\s*null/.test(next.expression.getText()) && /return\s+denied/.test(next.thenStatement.getText())
      return { index: i, awaitsBefore, returnsDenied }
    }
    if (awaits) awaitsBefore = true
  }
  return { index: -1, awaitsBefore, returnsDenied: false }
}

describe('view registry', () => {
  it('lists exactly the views the config registers', () => {
    const registry = registeredViews.map((v) => `${v.key}:${v.file}#${v.component}`).sort()
    expect(registry).toEqual(inConfig.map((v) => `${v.key}:${v.file}#${v.component}`).sort())
  })
  it('has no duplicate keys or paths', () => {
    const keys = registeredViews.map((v) => v.key)
    expect(new Set(keys).size).toBe(keys.length)
    const paths = registeredViews.map((v) => v.path).filter(Boolean)
    expect(new Set(paths).size).toBe(paths.length)
  })
  it('only Home is left to Payload to gate', () => {
    expect(registeredViews.filter((v) => v.gate === 'payload').map((v) => v.key)).toEqual(['dashboard'])
  })
})

describe('every registered view calls requireStaff first', () => {
  for (const view of registeredViews.filter((v) => v.gate === 'staff')) {
    it(`${view.key} (${view.component})`, () => {
      const fn = exportedFunction(path.join(root, 'payload/components', `${view.file}.tsx`), view.component)
      expect(fn, `${view.component} must be an exported function declaration`).not.toBeNull()
      const info = gateInfo(fn as ts.FunctionDeclaration)
      expect(info.index, 'requireStaff( is called in the body').toBeGreaterThanOrEqual(0)
      expect(info.awaitsBefore, 'nothing is awaited before the gate').toBe(false)
      expect(info.returnsDenied, 'the denial is returned right after').toBe(true)
    })
  }
})

describe('view source hygiene', () => {
  const sources = registeredViews.map((v) => ({ key: v.key, text: fs.readFileSync(path.join(root, 'payload/components', `${v.file}.tsx`), 'utf8') }))
  it('no view builds its own h1 or uses the old button classes (the shared kit does)', () => {
    expect(sources.filter((s) => /club-page__title|btn--style-|club-button-link/.test(s.text)).map((s) => s.key)).toEqual([])
  })
  it('every view except Home is wrapped in the shell', () => {
    expect(sources.filter((s) => s.key !== 'dashboard' && !/<AdminPage\b/.test(s.text)).map((s) => s.key)).toEqual([])
  })
})
