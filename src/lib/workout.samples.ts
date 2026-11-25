/** Sample structures for the tests and the fictional Demo Mode plan. Never offered as templates. */
import { newBlock } from './workout.ts'
import type { RunWorkout } from './types'

/** Warm-up, short reps, accelerations, 5–6 × 800 m and cool-down. */
export const SERIES_800: Pick<RunWorkout, 'name' | 'type' | 'blocks'> = {
  name: 'Series 5–6 × 800 m',
  type: 'interval',
  blocks: [
    { kind: 'warmup', reps: 1, reps_max: null, unit: 's', amount: 300, recovery_s: null, target_kind: null, target_s: null },
    { kind: 'strides', reps: 4, reps_max: null, unit: 's', amount: 30, recovery_s: 30, target_kind: null, target_s: null },
    { kind: 'progressive', reps: 4, reps_max: null, unit: 's', amount: 30, recovery_s: null, target_kind: null, target_s: null },
    { kind: 'main', reps: 5, reps_max: 6, unit: 'm', amount: 800, recovery_s: 180, target_kind: 'time', target_s: 270 },
    { kind: 'cooldown', reps: 1, reps_max: null, unit: 's', amount: 300, recovery_s: null, target_kind: null, target_s: null },
  ],
}

/** Warm-up, hill reps (15 s up, 1 min recovery, 15 s down) and cool-down. */
export const HILLS: Pick<RunWorkout, 'name' | 'type' | 'blocks'> = {
  name: 'Repeticiones en colina',
  type: 'interval',
  blocks: [newBlock('warmup'), newBlock('hills'), newBlock('cooldown')],
}
