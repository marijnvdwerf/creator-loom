import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'

// Singleton database instance
let dbInstance: ReturnType<typeof drizzle> | null = null

export function getDb() {
  if (!dbInstance) {
    const sqlite = new Database('./smp-timeline.db')
    dbInstance = drizzle(sqlite, { schema })
  }
  return dbInstance
}

export type DB = ReturnType<typeof getDb>
