import type { GameCommand, GameView, World } from './types'
import { advancement } from './advancement'
import type { Rules } from './rules'

export const dailyQuests = [
  { id: 'open', title: 'Open two packs', target: 2, reward: 100, action: 'open' },
  { id: 'work', title: 'Complete three sorting jobs', target: 3, reward: 125, action: 'job' },
  { id: 'chat', title: 'Join the collector conversation', target: 1, reward: 50, action: 'chat' },
] as const
export const questKey = (actor: string, day: string, id: string) => `quest:${actor}:${day}:${id}`
export function recordProgress(w: World, actor: string, command: GameCommand, day: string, rules?: Rules) {
  const earned = ({ open: 20 * Number(command.count), daily: 50, job: 25, grade: 15, claimQuest: 40 } as Record<string, number>)[command.action] ?? 0
  if (earned > 0 && Number.isSafeInteger(earned)) w.counters[`xp:${actor}`] = (w.counters[`xp:${actor}`] ?? 0) + earned
  if (rules && w.players[actor]) {
    const progress = advancement(w, actor, rules)
    w.counters[`peak-worth:${actor}`] = progress.peakWorth
  }
  for (const quest of dailyQuests) if (quest.action === command.action) {
    const key = questKey(actor, day, quest.id)
    const count = command.action === 'open' ? Number(command.count) : 1
    w.counters[key] = Math.min(quest.target, (w.counters[key] ?? 0) + count)
  }
}
export function progressionView(w: World, actor: string, now: number, rules?: Rules): GameView['progression'] {
  const day = new Date(now).toISOString().slice(0, 10)
  return {
    ...(rules ? { advancement: advancement(w, actor, rules) } : {}),
    streak: w.players[actor]?.dailyStreak ?? 0,
    quests: dailyQuests.map((q) => ({
      ...q, progress: w.counters[questKey(actor, day, q.id)] ?? 0,
      claimed: !!w.counters[`${questKey(actor, day, q.id)}:claimed`],
    })),
  }
}
