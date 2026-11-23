export const visualThemes = ['classic', 'custom', 'thanksgiving', 'christmas', 'holiday', 'midnight', 'celestial', 'industrial'] as const
export const visualFinishes = ['inherit', 'etched', 'holo', 'chrome', 'prismatic', 'aurora', 'emberglass', 'stardust', 'black-pearl', 'circuit', 'filigree', 'crystalline', 'glitch'] as const
export const visualEffects = ['none', 'glow', 'sparkle', 'snow', 'embers', 'rays', 'scan', 'confetti'] as const
export type VisualConfig = {
  color?: string
  theme?: typeof visualThemes[number]
  finish?: typeof visualFinishes[number]
  vfx?: typeof visualEffects[number]
  effectName?: string
  mutationName?: string
}
