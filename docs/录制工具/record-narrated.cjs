/**
 * 录制带配音讲解的演示视频
 * 依赖：.tmp/narr/narr/durations.json（由 narration.py 生成）
 * 输出：demo-video-narrated/medai-demo.webm + timeline.json
 */
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const BASE = 'http://127.0.0.1:8801';
const OUT = path.resolve(__dirname, 'demo-video-narrated');
const RAW = path.join(OUT, 'raw');
const META = JSON.parse(fs.readFileSync(path.resolve(__dirname, '.tmp/narr/narr/durations.json'), 'utf8'));
const DUR = Object.fromEntries(META.map((m) => [m.id, m.dur]));

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(RAW, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let t0 = 0;
const timeline = [];

async function caption(page, text) {
  await page.evaluate((t) => {
    let el = document.getElementById('__cap');
    if (!el) {
      el = document.createElement('div');
      el.id = '__cap';
      el.style.cssText = `position:fixed;left:24px;bottom:22px;z-index:99999;
        padding:10px 18px;border-radius:999px;font-size:15px;color:#fff;
        background:rgba(6,42,42,.86);backdrop-filter:blur(6px);
        box-shadow:0 8px 24px rgba(0,0,0,.25);font-family:"Microsoft YaHei",sans-serif;`;
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
}

/** 执行一个讲解步骤：记录起始时间 → 动作 → 等配音播完 */
async function step(id, page, label, action, pad = 500) {
  const start = Date.now();
  timeline.push({ id, offset: +((start - t0) / 1000).toFixed(2), dur: DUR[id] });
  if (label) await caption(page, label);
  if (action) await action();
  const target = start + DUR[id] * 1000 + pad;
  const remain = target - Date.now();
  if (remain > 0) await sleep(remain);
}

async function move(page, selector) {
  try {
    const box = await page.locator(selector).first().boundingBox();
    if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 14 });
  } catch { /* ignore */ }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: RAW, size: { width: 1440, height: 900 } },
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await sleep(800);

  // 片头
  t0 = Date.now();
  await page.evaluate(() => {
    const el = document.createElement('div');
    el.id = '__intro';
    el.style.cssText = `position:fixed;inset:0;z-index:999999;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:14px;
      background:radial-gradient(900px 600px at 50% 40%,#0a4440,#04201f 70%);
      color:#fff;font-family:"Microsoft YaHei",sans-serif;`;
    el.innerHTML = `
      <div style="font-size:15px;letter-spacing:6px;color:#7fd3c8">MEDAI · SMART MEDICAL QC</div>
      <div style="font-size:44px;font-weight:700;letter-spacing:2px">智医质控 MedAI</div>
      <div style="font-size:16px;color:#a9c9c5">AI 病历质控 · 辅助诊断 · 质控看板</div>
      <div style="margin-top:18px;font-size:12.5px;color:#6ea39d">Vue3 + TypeScript · Node.js · MySQL 8 · DeepSeek</div>`;
    document.body.appendChild(el);
  });
  await step('intro', page, null, async () => {
    await sleep(DUR.intro * 1000);
    await page.evaluate(() => document.getElementById('__intro')?.remove());
  }, 200);

  // 登录
  await step('login', page, '① 登录 · JWT 鉴权', async () => {
    await sleep(2400);                 // 等配音说到“演示账号可以一键填充”
    await page.locator('.demo-item', { hasText: '管理员' }).click();
    await sleep(900);
    await page.locator('input').first().click();
    await sleep(3400);                 // 等配音说到“登录成功后签发 JWT”
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await sleep(1600);
  });

  // 驾驶舱
  await step('dashboard', page, '② 质控驾驶舱', async () => {
    await sleep(600);
    await move(page, '.chart');
  });

  // 图表
  await step('charts', page, '③ 趋势 · 科室分布 · 高频问题', async () => {
    await page.mouse.wheel(0, 300);
    await sleep(1200);
    await page.mouse.wheel(0, -300);
  });

  // 病历列表
  await step('records', page, '④ 病历列表 · 状态与评分分档', async () => {
    await page.locator('.menu-item', { hasText: '病历质控' }).click();
    await sleep(1400);
    await move(page, '.el-table__body tr');
  });

  // 病历详情
  await step('detail', page, '⑤ 病历详情 · 结构化七要素', async () => {
    await page.locator('.el-table__body tr').first().click();
    await sleep(1600);
    await page.mouse.wheel(0, 200);
    await sleep(600);
    await page.mouse.wheel(0, -200);
  });

  // 运行质控
  await step('qcrun', page, '⑥ 一键运行 AI 质控', async () => {
    await sleep(3000);                 // 配音先介绍做了什么
    await page.getByRole('button', { name: /AI 质控|重新质控|立即质控/ }).first().click();
    await sleep(2200);
  });

  // 报告
  await step('report', page, '⑦ 四维度评分 · 问题清单 · 整改建议', async () => {
    await move(page, '.score-ring');
    await sleep(600);
    await page.mouse.wheel(0, 260);
    await sleep(600);
    await page.mouse.wheel(0, -260);
  });

  // 降级说明
  await step('fallback', page, '⑧ 未配置 Key 时自动降级规则引擎', async () => {
    await move(page, '.qc-head');
  });

  // 患者
  await step('patients', page, '⑨ 患者主索引与就诊档案', async () => {
    await page.locator('.menu-item', { hasText: '患者管理' }).click();
    await sleep(1400);
    await page.locator('.el-table__body tr').first().getByText('档案').click();
    await sleep(1400);
  });

  // 诊断
  await step('diagnosis', page, '⑩ AI 辅助诊断 · 鉴别诊断与危险信号', async () => {
    await page.keyboard.press('Escape');
    await sleep(500);
    await page.locator('.menu-item', { hasText: 'AI 辅助诊断' }).click();
    await sleep(1200);
    await page.locator('.quick-tag', { hasText: '发热咳嗽' }).click();
    await sleep(5000);                 // 等配音讲到“输出是…”
    await page.getByRole('button', { name: /生成诊断建议/ }).click();
    await sleep(2400);
  });

  // 助手
  await step('assistant', page, '⑪ AI 医学助手 · 多轮问答', async () => {
    await page.locator('.menu-item', { hasText: 'AI 医学助手' }).click();
    await sleep(1200);
    await page.getByRole('button', { name: '病历质控主要看哪些维度？' }).click();
    await sleep(2000);
  });

  // 规则
  await step('rules', page, '⑫ 质控规则 · 权重与启停', async () => {
    await page.locator('.menu-item', { hasText: '质控规则' }).click();
    await sleep(1300);
    await page.locator('.el-radio-button', { hasText: '完整性' }).click();
    await sleep(800);
  });

  // 日志 + 用户
  await step('audit', page, '⑬ 审计日志与用户管理', async () => {
    await page.locator('.menu-item', { hasText: '操作日志' }).click();
    await sleep(1300);
    await page.locator('.el-select').first().click();
    await sleep(600);
    await page.locator('.el-select-dropdown__item', { hasText: 'AI 质控' }).click();
    await sleep(1000);
    await page.locator('.menu-item', { hasText: '用户管理' }).click();
    await sleep(1200);
  });

  // 收尾
  await step('outro', page, '⑭ 交付：代码 · 数据库脚本 · 部署脚本', async () => {
    await page.locator('.menu-item', { hasText: '质控驾驶舱' }).click();
    await sleep(1500);
  }, 800);

  await context.close();
  await browser.close();

  const files = fs.readdirSync(RAW).filter((f) => f.endsWith('.webm'));
  const src = path.join(RAW, files[0]);
  fs.copyFileSync(src, path.join(OUT, 'medai-narrated.webm'));
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(timeline, null, 2));
  console.log('TIMELINE:', timeline.map((t) => `${t.id}@${t.offset}`).join(' '));
}

main().catch((err) => {
  console.error('录制失败：', err);
  process.exit(1);
});
