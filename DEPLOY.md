# 部署備忘

## 現在（測試階段）——什麼都不用改

```bash
npm run dev      # 前端 http://localhost:5173（/api 自動代理到 8787）
npm run server   # 後端（另開終端；沒開也能玩，競技場退離線機器人）
```

存檔：`server/data/db.json`（JSON 驅動，gitignored）。

## 之後（正式部署）——Docker 一鍵

```bash
docker compose up -d --build
# → http://localhost:8787 就是完整遊戲（前端+API 同源，免 CORS/代理）
```

容器內預設：`DB_DRIVER=sqlite`（WAL 耐久單檔）、資料在 `game-data` volume。
備份 = 備份 volume；換機 = 帶著 volume 走。

## 環境變數（server/config.js）

| 變數 | 預設 | 說明 |
|---|---|---|
| `PORT` | 8787 | HTTP 埠 |
| `DB_DRIVER` | json | `json`（開發）/ `sqlite`（正式，node:sqlite 零依賴） |
| `DATA_DIR` | server/data | 資料目錄 |
| `STATIC_DIR` | （空） | 設 `dist` 則同時伺服前端（單容器模式） |
| `CORS_ORIGIN` | * | 同源部署時設 `off` |

## 升級路線（縫都留好了）

1. **SQLite → Postgres**：`server/db.js` 是唯一存取層（load/persist 介面），
   加一個 pg 驅動 + docker-compose 解開 db 服務即可；業務模組（arena/friends/guild）不動。
2. **反向代理 + TLS**：容器前面加 Caddy/nginx（compose 再加一個 service）。
3. **即時功能（公會聊天）**：同一個 http server 掛 WebSocket upgrade。
4. **貨幣伺服器權威**：把 currencies/cards 搬進 saves 的伺服器校驗流程
   （grantRewards 的入帳點都已集中，見 memory/backend-architecture）。
