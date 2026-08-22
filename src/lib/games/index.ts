// ─── Mini-game registry ─────────────────────────────────────────────────────
// One module per world owns its own games, painters and factory. This barrel
// keeps the `@/lib/games` import path stable for the MiniGame shell.

import { OCEAN_GAMES, oceanGame } from "./ocean";
import { SPACE_GAMES, spaceGame } from "./space";
import { FARM_GAMES, farmGame } from "./farm";
import { DINO_GAMES, dinoGame } from "./dino";
import type { GameInstance, GameMeta } from "./core";

export type { Frame, GameAPI, GameInstance, GameMeta, Input } from "./core";
export { star5 } from "./core";

export const WORLD_GAMES: Record<string, GameMeta[]> = {
  ocean: OCEAN_GAMES,
  space: SPACE_GAMES,
  farm: FARM_GAMES,
  dino: DINO_GAMES,
};

export function createGame(id: string): GameInstance {
  return (
    oceanGame(id) ?? spaceGame(id) ?? farmGame(id) ?? dinoGame(id) ?? oceanGame("bubbleGulp")!
  );
}
