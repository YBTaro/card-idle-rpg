// 伺服器設定：全部走環境變數（12-factor），預設值＝開發模式行為。
// 測試階段什麼都不用設；正式部署（Docker）時用 env 翻開關。
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  // HTTP 埠
  port: Number(process.env.PORT || 8787),

  // 資料目錄（Docker 掛 volume 到這裡）
  dataDir: process.env.DATA_DIR || path.join(HERE, 'data'),

  // 儲存驅動：'json'（開發預設）| 'sqlite'（正式：WAL 耐久、單檔可備份）
  dbDriver: process.env.DB_DRIVER || 'json',

  // 靜態檔目錄：設了就同時伺服前端（單容器部署＝遊戲+API 同源，免 CORS/代理）。
  // 例：STATIC_DIR=dist。開發時留空（vite 自己伺服前端）。
  staticDir: process.env.STATIC_DIR || null,

  // CORS 來源：開發全開；正式部署若前後端同源可設 'off' 關掉標頭
  corsOrigin: process.env.CORS_ORIGIN || '*',
};
