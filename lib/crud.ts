import { eq } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'

type AnyDb = {
  select: () => { from: (table: unknown) => Promise<unknown[]> | unknown[] }
  insert: (table: unknown) => { values: (v: object) => Promise<unknown> }
  update: (table: unknown) => { set: (v: object) => { where: (cond: unknown) => Promise<unknown> } }
  delete: (table: unknown) => { where: (cond: unknown) => Promise<unknown> }
}

export function makeCrudActions<Row extends { id: number }>(
  db: AnyDb,
  table: PgTable & { id: { name: string } },
  revalidate: () => void
) {
  return {
    async list(): Promise<Row[]> {
      return (await db.select().from(table)) as Row[]
    },
    async create(data: Omit<Row, 'id' | 'createdAt'>) {
      await db.insert(table).values(data as object)
      revalidate()
    },
    async update(id: number, data: Partial<Omit<Row, 'id' | 'createdAt'>>) {
      await db.update(table).set(data as object).where(eq(table.id as never, id))
      revalidate()
    },
    async remove(id: number) {
      await db.delete(table).where(eq(table.id as never, id))
      revalidate()
    },
  }
}
