import { db } from '../db'
import { sponsors } from '../db/schema'
import { SPONSORS } from './sponsors-data'

// Replaces every sponsor row with the list in sponsors-data.ts.
async function main() {
  await db.delete(sponsors)
  await db.insert(sponsors).values(SPONSORS)
  console.log(`Sponsors reset: ${SPONSORS.length} rows.`)
}

main()
