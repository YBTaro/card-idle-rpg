// 可選 seed 的亂數工具。預設用 Math.random，傳入 seed 時用 mulberry32
// （確定性 PRNG），方便戰鬥重播與單元測試。

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this._next = seed == null ? Math.random : mulberry32(seed);
  }

  // [0, 1)
  next() {
    return this._next();
  }

  // [min, max) 浮點
  range(min, max) {
    return min + this.next() * (max - min);
  }

  // [min, max] 整數
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  // 從陣列隨機取一個
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  // 依權重抽一個。entries: [{ weight, ...rest }]，回傳被抽中的 entry。
  weightedPick(entries) {
    const total = entries.reduce((s, e) => s + e.weight, 0);
    let r = this.next() * total;
    for (const e of entries) {
      r -= e.weight;
      if (r < 0) return e;
    }
    return entries[entries.length - 1];
  }
}

// 共用的預設亂數（非確定性）
export const rng = new Rng();
