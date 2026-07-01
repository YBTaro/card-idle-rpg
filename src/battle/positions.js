// src/battle/positions.js
// 位置模型：6 格固定站位。前排 1/2/3、後排 4/5/6；直行 A=(1,4) B=(2,5) C=(3,6)。
export const FRONT_POSITIONS = [1, 2, 3];
export const BACK_POSITIONS = [4, 5, 6];
export const ALL_POSITIONS = [1, 2, 3, 4, 5, 6];

export function rowOf(pos) {
  return pos <= 3 ? 'front' : 'back';
}

export function columnOf(pos) {
  return ((pos - 1) % 3) + 1; // 1|4→1, 2|5→2, 3|6→3
}

// 出手序列：我1,敵1,我2,敵2,…,我6,敵6
export const TURN_SEQUENCE = ALL_POSITIONS.flatMap((pos) => [[0, pos], [1, pos]]);
