// 建立 PixiJS Application（佔位圖形）。
import { Application } from 'pixi.js';

export const STAGE_W = 960;
export const STAGE_H = 540;

// 建立並掛載到指定 DOM 容器。回傳 app。
export async function createPixiApp(container) {
  const app = new Application();
  await app.init({
    width: STAGE_W,
    height: STAGE_H,
    background: '#0c0e14',
    antialias: true,
    autoDensity: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
  });
  container.innerHTML = '';
  container.appendChild(app.canvas);
  return app;
}
