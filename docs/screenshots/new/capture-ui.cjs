/**
 * 用本机 Edge 的 CDP 接口给新功能截图（无需安装 Playwright）。
 * 前置：Edge 以 --remote-debugging-port=9222 启动，后端运行在 8801。
 */
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'http://127.0.0.1:8801';
const OUT = __dirname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url) {
  const res = await fetch(url);
  return res.json();
}

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  }).then((r) => r.json());
  if (login.code !== 0) throw new Error(`登录失败: ${JSON.stringify(login)}`);
  const token = login.data.token;
  const user = JSON.stringify(login.data.user);

  const list = await getJSON('http://127.0.0.1:9222/json/list');
  const target = list.find((t) => t.type === 'page');
  if (!target) throw new Error('没有可用的浏览器页面');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await send('Page.navigate', { url: `${BASE}/login` });
  await sleep(1200);
  await send('Runtime.evaluate', {
    expression: `localStorage.setItem('medai_token', ${JSON.stringify(token)}); localStorage.setItem('medai_user', ${JSON.stringify(user)});`,
  });

  async function shot(name, url, wait = 2600, script = '') {
    await send('Page.navigate', { url });
    await sleep(wait);
    if (script) {
      await send('Runtime.evaluate', { expression: script, awaitPromise: true, returnByValue: true });
      await sleep(700);
    }
    const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.join(OUT, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(res.result.data, 'base64'));
    console.log('saved', file);
  }

  await shot('dashboard', `${BASE}/dashboard`, 4200);
  await shot('workbench', `${BASE}/workbench`, 3200);
  await shot(
    'workbench-tasks',
    `${BASE}/workbench`,
    3000,
    `document.querySelectorAll('.el-tabs__item')[1]?.click();`,
  );
  await shot(
    'record-review',
    `${BASE}/records/31`,
    3400,
    `Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('复核 / 改判'))?.click();`,
  );
  await shot(
    'logs-verify',
    `${BASE}/logs`,
    2800,
    `Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('校验完整性'))?.click();`,
  );
  await shot(
    'records-batch',
    `${BASE}/records`,
    3000,
    `document.querySelectorAll('.el-table__body .el-checkbox__original')[0]?.click(); document.querySelectorAll('.el-table__body .el-checkbox__original')[1]?.click(); document.querySelectorAll('.el-table__body .el-checkbox__original')[2]?.click();`,
  );
  await shot('record-loop', `${BASE}/records/27`, 3600);
  await shot('record-overridden', `${BASE}/records/17`, 3400);
  await shot('report-print', `${BASE}/records/27/report`, 3000);
  await shot('rules-usage', `${BASE}/rules`, 2600);

  ws.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
