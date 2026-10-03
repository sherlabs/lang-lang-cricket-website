/**
 * In-memory stand-in for the Payload Local API (spec §15 `unit` project). Backs
 * `vi.mock('@/lib/payload/client')` so query modules run without a database, and records
 * every call so tests can assert on the `where`, `sort`, `joins` and `depth` each query passes.
 *
 * Supports: find (where: equals, not_equals, in, not_in, greater_than(_equal), less_than(_equal),
 * exists, like, and/or; sort: string | string[] with '-' for descending; limit; pagination),
 * findByID, create, update (by id), delete (by id), count, findGlobal, updateGlobal.
 */
type Doc = Record<string, unknown> & { id: number }
type Where = Record<string, unknown>

export type FakeCall = { op: string; args: Record<string, unknown> }

function get(doc: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), doc)
}

const cmp = (a: unknown, b: unknown) => {
  const x = a instanceof Date ? a.getTime() : a
  const y = b instanceof Date ? b.getTime() : b
  if (typeof x === 'string' && typeof y === 'string' && !Number.isNaN(Date.parse(x)) && !Number.isNaN(Date.parse(y)) && /\d{4}-\d{2}-\d{2}/.test(x)) {
    return Date.parse(x) - Date.parse(y)
  }
  return (x as number) < (y as number) ? -1 : (x as number) > (y as number) ? 1 : 0
}

export function matches(doc: Record<string, unknown>, where?: Where): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'and') return (cond as Where[]).every((w) => matches(doc, w))
    if (key === 'or') return (cond as Where[]).some((w) => matches(doc, w))
    const value = get(doc, key)
    return Object.entries(cond as Record<string, unknown>).every(([op, operand]) => {
      switch (op) {
        case 'equals':
          return value === operand || (value instanceof Date && cmp(value, operand) === 0)
        case 'not_equals':
          return value !== operand
        case 'in':
          return (operand as unknown[]).includes(value)
        case 'not_in':
          return !(operand as unknown[]).includes(value)
        case 'greater_than':
          return cmp(value, operand) > 0
        case 'greater_than_equal':
          return cmp(value, operand) >= 0
        case 'less_than':
          return cmp(value, operand) < 0
        case 'less_than_equal':
          return cmp(value, operand) <= 0
        case 'exists':
          return operand ? value !== undefined && value !== null : value === undefined || value === null
        case 'like':
          return typeof value === 'string' && value.toLowerCase().includes(String(operand).toLowerCase())
        default:
          throw new Error(`payload-fake: unsupported operator ${op}`)
      }
    })
  })
}

function sortDocs(docs: Doc[], sort?: string | string[]): Doc[] {
  const keys = (Array.isArray(sort) ? sort : sort ? [sort] : []).map((s) => (s.startsWith('-') ? { k: s.slice(1), dir: -1 } : { k: s, dir: 1 }))
  if (!keys.length) return docs
  return [...docs].sort((a, b) => {
    for (const { k, dir } of keys) {
      const c = cmp(get(a, k), get(b, k))
      if (c) return c * dir
    }
    return 0
  })
}

export function createPayloadFake(seed: Record<string, Doc[]> = {}, globals: Record<string, Record<string, unknown>> = {}) {
  const store: Record<string, Doc[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((d) => ({ ...d }))]))
  const globalStore: Record<string, Record<string, unknown>> = { ...globals }
  const calls: FakeCall[] = []
  let nextId = 1000
  const coll = (c: string) => (store[c] ??= [])

  const api = {
    calls,
    store,
    callsTo: (op: string, collection?: string) => calls.filter((c) => c.op === op && (!collection || c.args.collection === collection || c.args.slug === collection)),
    lastWrite: () => [...calls].reverse().find((c) => ['create', 'update', 'delete', 'updateGlobal'].includes(c.op)),
    async find(args: { collection: string; where?: Where; sort?: string | string[]; limit?: number; pagination?: boolean; page?: number }) {
      calls.push({ op: 'find', args })
      let docs = sortDocs(coll(args.collection).filter((d) => matches(d, args.where)), args.sort)
      const totalDocs = docs.length
      // Payload: pagination:false without a limit returns everything; limit 0 means no limit.
      const limit = args.pagination === false && args.limit === undefined ? 0 : (args.limit ?? 10)
      if (limit > 0) docs = docs.slice(0, limit)
      return { docs: docs.map((d) => ({ ...d })), totalDocs }
    },
    async findByID(args: { collection: string; id: number }) {
      calls.push({ op: 'findByID', args })
      const doc = coll(args.collection).find((d) => d.id === args.id)
      if (!doc) throw new Error('Not Found')
      return { ...doc }
    },
    async count(args: { collection: string; where?: Where }) {
      calls.push({ op: 'count', args })
      return { totalDocs: coll(args.collection).filter((d) => matches(d, args.where)).length }
    },
    async create(args: { collection: string; data: Record<string, unknown> }) {
      calls.push({ op: 'create', args })
      const doc = { id: (args.data.id as number) ?? nextId++, ...args.data } as Doc
      coll(args.collection).push(doc)
      return { ...doc }
    },
    async update(args: { collection: string; id: number; data: Record<string, unknown> }) {
      calls.push({ op: 'update', args })
      const doc = coll(args.collection).find((d) => d.id === args.id)
      if (!doc) throw new Error('Not Found')
      Object.assign(doc, args.data)
      return { ...doc }
    },
    async delete(args: { collection: string; id: number }) {
      calls.push({ op: 'delete', args })
      const list = coll(args.collection)
      const i = list.findIndex((d) => d.id === args.id)
      if (i < 0) throw new Error('Not Found')
      return list.splice(i, 1)[0]
    },
    async findGlobal(args: { slug: string }) {
      calls.push({ op: 'findGlobal', args })
      return { ...(globalStore[args.slug] ?? {}) }
    },
    async updateGlobal(args: { slug: string; data: Record<string, unknown> }) {
      calls.push({ op: 'updateGlobal', args })
      globalStore[args.slug] = { ...(globalStore[args.slug] ?? {}), ...args.data, updatedAt: new Date().toISOString() }
      return { ...globalStore[args.slug] }
    },
  }
  return api
}

export type PayloadFake = ReturnType<typeof createPayloadFake>
