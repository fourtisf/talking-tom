/** Scene keys in one place so a rename cannot silently break a transition. */
export const SCENE = {
  boot: 'Boot',
  preload: 'Preload',
  home: 'Home',
  miniGame: 'MiniGame',
  shop: 'Shop',
  settings: 'Settings',
  tasks: 'Tasks',
  tutorial: 'Tutorial',
} as const;

export type SceneKey = (typeof SCENE)[keyof typeof SCENE];
