// 種族定義：三圍修正 + 種族特色說明。
// 三圍決定層級：職業（CLASSES.statMods，影響最大）→ 種族（本檔，±8~12%）→ 個體微調（cards.js base）。
// 種族特色的另一半在技能/被動：各種族的簽名效果數值比通用版高（見 cards.js 頭註）。
export const RACES = {
  人: {
    id: '人', label: '人',
    statMods: { hp: 1.0, atk: 1.0, def: 1.0 },
    trait: '均衡無短板——紅利在系列協同（聖歌隊/鐵壁/光輝…的系列 buff 值最高）',
  },
  不死: {
    id: '不死', label: '不死',
    statMods: { hp: 1.06, atk: 0.98, def: 0.94 },
    trait: '爛命一條：血厚防低——亡者之勢（隊友越死越強）與重傷詛咒為其專屬',
  },
  精靈: {
    id: '精靈', label: '精靈',
    statMods: { hp: 0.98, atk: 1.1, def: 1.0 },
    trait: '靈巧脆皮：三圍偏攻——集氣與迴避類效果數值最高，靠閃與快彌補生存',
  },
  妖: {
    id: '妖', label: '妖',
    statMods: { hp: 0.95, atk: 1.1, def: 0.88 },
    trait: '玻璃大砲：全遊戲最高攻擊修正——吸血/竊能/惡夢等汲取效果數值最高',
  },
  獸: {
    id: '獸', label: '獸',
    statMods: { hp: 1.12, atk: 1.08, def: 0.94 },
    trait: '蠻力肉身：血攻雙高防低——低血觸發與疊怒類效果數值最高',
  },
  機械: {
    id: '機械', label: '機械',
    statMods: { hp: 0.92, atk: 1.0, def: 1.22 }, // 攻擊不懲罰：護盾量吃攻擊力，砍攻＝砍盾（特色自打）
    trait: '裝甲工程：全遊戲最高防禦修正、攻擊最低——護盾類效果數值最高',
  },
  龍: {
    id: '龍', label: '龍',
    statMods: { hp: 1.06, atk: 1.05, def: 1.02 },
    trait: '稀有明星卡：三圍全面高於他族——特色就是裸數值，技能效果走通用值',
  },
  神: {
    id: '神', label: '神',
    statMods: { hp: 1.0, atk: 0.97, def: 1.08 },
    trait: '稀有庇護者：難殺的輔助——治療與受治療增幅為其專屬',
  },
};

export const RACE_LIST = Object.values(RACES);
