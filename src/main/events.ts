/** Things happening in your day that the main process tells the cat about. */
export type PetEvent =
  | { type: 'away' }
  | { type: 'back'; minutes: number }
  | { type: 'breakDue'; activeMinutes: number }
  | { type: 'breakTaken' }
  | { type: 'waterDue' }
  | { type: 'lateNight' }
  | { type: 'commit'; repo: string; kind: 'commit' | 'amend' | 'merge' }
  | { type: 'push'; repo: string }
  | { type: 'reposFound'; count: number };
