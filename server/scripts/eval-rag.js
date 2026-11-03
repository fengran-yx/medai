/**
 * RAG 检索评测：Recall@1 / Recall@3 / MRR
 *
 * 用法：
 *   node scripts/eval-rag.js            # 打印四种配置的对比
 *   node scripts/eval-rag.js --ci       # CI 模式：Recall@3 低于阈值则退出码 1
 *
 * 指标含义：
 *   Recall@1  第一名就命中正确文档的比例（用户体验最直接的指标）
 *   Recall@3  前三名里出现正确文档的比例（够用于喂给大模型）
 *   MRR       正确文档排名的倒数均值（排名越靠前越高）
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import 'dotenv/config';
import { pool, query } from '../src/db.js';
import { buildIndex, search } from '../src/kb/search.js';

const K = 3;
const THRESHOLD = Number(process.env.EVAL_THRESHOLD || 0.8);

const CONFIGS = [
  { name: '基线（BM25+余弦）', rewrite: false, rerank: false },
  { name: '+ 同义扩展', rewrite: true, rerank: false },
  { name: '+ 词覆盖重排', rewrite: false, rerank: true },
  { name: '+ 扩展 + 重排', rewrite: true, rerank: true },
];

async function loadIndex() {
  const rows = await query(
    `SELECT c.id, c.doc_id AS docId, c.content, d.title, d.category
     FROM kb_chunks c JOIN kb_documents d ON d.id = c.doc_id`,
  );
  return buildIndex(rows);
}

function evaluate(index, dataset, config) {
  let hit1 = 0;
  let hit3 = 0;
  let mrr = 0;
  const misses = [];

  for (const item of dataset) {
    const hits = search(index, item.q, K, { rewrite: config.rewrite, rerank: config.rerank });
    const titles = hits.map((h) => h.title);
    const rank = titles.indexOf(item.doc);

    if (rank === 0) hit1++;
    if (rank >= 0) hit3++;
    if (rank >= 0) mrr += 1 / (rank + 1);
    else misses.push({ q: item.q, expect: item.doc, got: titles.slice(0, 2) });
  }

  const total = dataset.length;
  return {
    recall1: hit1 / total,
    recall3: hit3 / total,
    mrr: mrr / total,
    misses,
  };
}

const pct = (n) => `${(n * 100).toFixed(1)}%`;

async function main() {
  const ci = process.argv.includes('--ci');
  const file = path.resolve(process.cwd(), 'scripts/eval-rag.dataset.json');
  const dataset = JSON.parse(await fs.readFile(file, 'utf8'));

  const index = await loadIndex();
  if (!index.docs.length) {
    console.error('知识库为空，请先执行 npm run kb:seed');
    process.exit(1);
  }

  console.log(`\n评测集：${dataset.length} 条问题 / 知识库：${index.docs.length} 个分块\n`);
  console.log('配置'.padEnd(22) + 'Recall@1'.padEnd(12) + 'Recall@3'.padEnd(12) + 'MRR');
  console.log('─'.repeat(60));

  const results = [];
  for (const config of CONFIGS) {
    const r = evaluate(index, dataset, config);
    results.push({ config, ...r });
    console.log(
      config.name.padEnd(20) +
        pct(r.recall1).padEnd(12) +
        pct(r.recall3).padEnd(12) +
        r.mrr.toFixed(3),
    );
  }

  const best = results.reduce((a, b) => (b.recall3 > a.recall3 ? b : a));
  const base = results[0];

  console.log('\n最佳配置：' + best.config.name);
  console.log(
    `  相比基线：Recall@3 ${pct(base.recall3)} → ${pct(best.recall3)}，` +
      `MRR ${base.mrr.toFixed(3)} → ${best.mrr.toFixed(3)}`,
  );

  if (!ci && base.misses.length) {
    console.log('\n基线未命中的问题（前 5 条）：');
    base.misses.slice(0, 5).forEach((m) => {
      console.log(`  ✗ ${m.q}\n    期望: ${m.expect}\n    实际: ${m.got.join(' / ')}`);
    });
  }

  const shipped = results[3];
  console.log(`\n线上默认配置（扩展+重排）：Recall@3 = ${pct(shipped.recall3)}、MRR = ${shipped.mrr.toFixed(3)}`);

  await pool.end();

  if (ci) {
    if (shipped.recall3 < THRESHOLD) {
      console.error(`\n✗ Recall@3 ${pct(shipped.recall3)} 低于阈值 ${pct(THRESHOLD)}`);
      process.exit(1);
    }
    console.log(`\n✓ Recall@3 达到阈值 ${pct(THRESHOLD)}`);
  }
}

main().catch((err) => {
  console.error('评测失败：', err);
  process.exit(1);
});
