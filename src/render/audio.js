// 語音/音效掛點：manifest（data/assets.js 的 VOICE_MANIFEST）有檔才播，沒有就靜默。
// 素材到位後只要在 manifest 填路徑，全遊戲即接上語音，程式不用再動。
import { voiceFor } from '../data/assets.js';

const ATTACK_VOICE_CHANCE = 0.35; // 普攻語音播放機率（每次都喊會很吵；業界慣例抽播）
const VOICE_VOLUME = 0.9;

const cache = new Map();
let muted = false;

export function setMuted(v) {
  muted = v;
}

// kind: 'ultimate'（絕技，必播）| 'attack'（普攻，抽播）
export function playVoice(cardId, kind) {
  if (muted) return;
  if (kind === 'attack' && Math.random() > ATTACK_VOICE_CHANCE) return;
  const src = voiceFor(cardId, kind);
  if (!src) return;
  let a = cache.get(src);
  if (!a) {
    a = new Audio(src);
    a.volume = VOICE_VOLUME;
    cache.set(src, a);
  }
  a.currentTime = 0;
  a.play().catch(() => {
    /* 瀏覽器自動播放限制或檔案缺失 → 靜默 */
  });
}
