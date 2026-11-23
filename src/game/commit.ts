import { applyCommand, type EngineEnv } from './engine'
import type { CommandResult, GameCommand, World } from './types'

export type Revision = { sequence: number; state: World }
export type AtomicStore = {
  read: () => Promise<Revision>
  append: (commit: Revision & { result: CommandResult }) => Promise<void>
}

// The store must atomically reject an already-used sequence. Production uses
// Payload's unique database constraint; tests can exercise the same retry loop.
export async function commitAtomic(
  store: AtomicStore,
  actor: string,
  command: GameCommand,
  environment: () => EngineEnv,
) {
  for (let attempt = 0; attempt < 16; attempt++) {
    const current = await store.read()
    const { state, result } = applyCommand(current.state, actor, command, environment())
    if (state === current.state) return result
    try {
      await store.append({ sequence: current.sequence + 1, state, result })
      return result
    } catch (error) {
      const fresh = await store.read()
      if (fresh.sequence <= current.sequence) throw error
    }
  }
  throw new Error('The economy is busy. Please retry in a moment.')
}
