/**
 * 录制演示视频：自动走完「登录 → 驾驶舱 → 病历质控 → 辅助诊断 → 医学助手 → 规则 → 日志 → 用户」
 * 运行：node record-demo.cjs
 */
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const BASE = 'http://127.0.0.1:8801';
const OUT_DIR = path.resolve(__dirname, 'demo-video');
const SRC_DIR = path.join(OUT_DIR, 'raw');

fs.rmSync(SRC_DIR, { recursive: true, force: true });
fs.mkdirSync(SRC_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function caption(page, text, ms = 900) {
  await page.evaluate((t) => {
    let el = document.getElementById('__cap');
    if (!el) {
      el = document.createElement('div');
      el.id = '__cap';
      el.style.cssText = `position:fixed;left:24px;bottom:22px;z-index:99999;
        padding:10px 18px;border-radius:999px;font-size:15px;color:#fff;
        background:rgba(6,42,42,.86);backdrop-filter:blur(6px);
        box-shadow:0 8px 24px rgba(0,0,0,.25);font-family:"Microsoft YaHei",sans-serif;
        letter-spacing:.5px;transition:opacity .25s;`;
      document.body.appendChild(el);
    }
    el.textContent = t;
    el.style.opacity = '1';
  }, text);
  await sleep(ms);
}

async function move(page, selector, steps = 12) {
  try {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) return;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps });
  } catch { /* 忽略 */ }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: SRC_DIR, size: { width: 1440, height: 900 } },
    deviceScaleFactor: 1,
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  // 1. 登录页
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await sleep(1200);

  // 片头
  await page.evaluate(() => {
    const el = document.createElement('div');
    el.id = '__intro';
    el.style.cssText = `position:fixed;inset:0;z-index:999999;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:14px;
      background:radial-gradient(900px 600px at 50% 40%,#0a4440,#04201f 70%);
      color:#fff;font-family:"Microsoft YaHei",sans-serif;transition:opacity .5s;`;
    el.innerHTML = `
      <div style="font-size:15px;letter-spacing:6px;color:#7fd3c8">MEDAI · SMART MEDICAL QC</div>
      <div style="font-size:44px;font-weight:700;letter-spacing:2px">智医质控 MedAI</div>
      <div style="font-size:16px;color:#a9c9c5;letter-spacing:1px">AI 病历质控 · 辅助诊断 · 质控看板</div>
      <div style="margin-top:18px;font-size:12.5px;color:#6ea39d">Vue3 + TypeScript · Node.js · MySQL 8 · DeepSeek</div>`;
    document.body.appendChild(el);
  });
  await sleep(2600);
  await page.evaluate(() => { const el = document.getElementById('__intro'); if (el) el.remove(); });
  await sleep(400);

  await caption(page, '① 登录：点击「管理员」演示账号自动填充', 1400);
  await page.locator('.demo-item', { hasText: '管理员' }).click();
  await sleep(800);
  await page.locator('input').first().click();
  await sleep(400);
  await caption(page, '② 输入账号密码，登录系统', 900);
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await sleep(2600);

  // 2. 驾驶舱
  await caption(page, '③ 质控驾驶舱：患者数、平均分、通过率、趋势图', 1600);
  await move(page, '.chart');
  await sleep(1200);
  await page.mouse.wheel(0, 320);
  await sleep(1800);
  await caption(page, '④ 科室分布 · 高频质控问题 · 最近质控动态', 1800);
  await page.mouse.wheel(0, -320);
  await sleep(900);

  // 3. 病历质控列表
  await page.locator('.menu-item', { hasText: '病历质控' }).click();
  await sleep(1800);
  await caption(page, '⑤ 病历列表：按状态 / 科室 / 关键词筛选，红黄绿即质控分档', 1800);
  await move(page, '.el-table__body tr');
  await sleep(600);

  // 4. 打开一份不通过病历
  await page.locator('.el-table__body tr').first().click();
  await sleep(2000);
  await caption(page, '⑥ 病历详情：结构化七要素 + 右侧历史质控报告', 1600);
  await page.mouse.wheel(0, 260);
  await sleep(1200);
  await page.mouse.wheel(0, -260);
  await sleep(600);

  // 5. 运行 AI 质控
  await caption(page, '⑦ 一键运行 AI 质控：四维度评分 + 问题清单 + 整改建议', 1200);
  await page.getByRole('button', { name: /AI 质控|重新质控|立即质控/ }).first().click();
  await sleep(2600);
  await caption(page, '⑧ 质控报告：四维度评分 + 逐条问题 + 整改建议', 2200);
  await move(page, '.issues');
  await sleep(1000);

  // 6. 患者管理
  await page.locator('.menu-item', { hasText: '患者管理' }).click();
  await sleep(1600);
  await caption(page, '⑨ 患者主索引：病案号、过敏史、就诊次数', 1400);
  await page.locator('.el-table__body tr').first().getByText('档案').click();
  await sleep(1800);
  await caption(page, '⑩ 患者档案抽屉：基本信息 + 就诊时间线', 1800);
  await page.keyboard.press('Escape');
  await sleep(800);

  // 7. AI 辅助诊断
  await page.locator('.menu-item', { hasText: 'AI 辅助诊断' }).click();
  await sleep(1500);
  await caption(page, '⑪ 辅助诊断：点击「发热咳嗽」快速填入病例', 1200);
  await page.locator('.quick-tag', { hasText: '发热咳嗽' }).click();
  await sleep(1000);
  await page.getByRole('button', { name: /生成诊断建议/ }).click();
  await sleep(2600);
  await caption(page, '⑫ 输出鉴别诊断、ICD-10、建议检查与危险信号', 2600);
  await page.mouse.wheel(0, 300);
  await sleep(1600);

  // 8. AI 医学助手
  await page.locator('.menu-item', { hasText: 'AI 医学助手' }).click();
  await sleep(1500);
  await caption(page, '⑬ 医学助手：多会话问答，历史自动落库', 1200);
  await page.getByRole('button', { name: '病历质控主要看哪些维度？' }).click();
  await sleep(2800);
  await caption(page, '⑭ 回答按四维度展开，可继续追问', 2000);

  // 9. 质控规则
  await page.locator('.menu-item', { hasText: '质控规则' }).click();
  await sleep(1600);
  await caption(page, '⑮ 质控规则：12 条规则，可调严重程度与扣分权重', 1400);
  await page.locator('.el-radio-button', { hasText: '完整性' }).click();
  await sleep(1600);
  await page.locator('.el-switch').first().click();
  await sleep(1500);

  // 10. 操作日志
  await page.locator('.menu-item', { hasText: '操作日志' }).click();
  await sleep(1600);
  await caption(page, '⑯ 操作日志：登录、质控、建档、诊断全留痕', 1800);
  await page.locator('.el-select').first().click();
  await sleep(700);
  await page.locator('.el-select-dropdown__item', { hasText: 'AI 质控' }).click();
  await sleep(1800);

  // 11. 用户管理
  await page.locator('.menu-item', { hasText: '用户管理' }).click();
  await sleep(1800);
  await caption(page, '⑰ 用户管理：三种角色、科室归属、启停与重置密码', 2200);

  // 12. 回驾驶舱收尾
  await page.locator('.menu-item', { hasText: '质控驾驶舱' }).click();
  await sleep(1800);
  await caption(page, '智医质控 MedAI · 演示完', 1600);

  await context.close();
  await browser.close();

  const files = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.webm'));
  if (!files.length) throw new Error('未生成视频文件');
  const src = path.join(SRC_DIR, files[0]);
  const out = path.join(OUT_DIR, 'medai-demo.webm');
  fs.copyFileSync(src, out);
  console.log('VIDEO:' + out);
}

main().catch((err) => {
  console.error('录制失败：', err);
  process.exit(1);
});
