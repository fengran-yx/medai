/**
 * 轻量检索：BM25（词法） + TF-IDF 余弦（近似向量）混合打分
 *
 * 为什么不用向量数据库：
 *  - 演示规模（几百个 chunk）在内存里算余弦绰绰有余，零依赖、可解释；
 *  - 面试时可以讲清楚「为什么这样取权重、怎么调 k1/b」，比调库更有说服力；
 *  - 真上规模时把 search() 换成 pgvector / Milvus 即可，接口不变。
 */

import { tokenize, termFreq, expandQuery } from './tokenize.js';

const K1 = 1.5;
const B = 0.75;

/** 由分块构建索引（一次性内存索引，规模小） */
export function buildIndex(chunks) {
  const docs = chunks.map((c) => {
    const tokens = tokenize(c.content);
    const tf = termFreq(tokens);
    return { ...c, tokens, tf, len: tokens.length };
  });

  const df = Object.create(null);
  for (const d of docs) {
    for (const term of Object.keys(d.tf)) df[term] = (df[term] || 0) + 1;
  }

  const avgdl = docs.reduce((s, d) => s + d.len, 0) / (docs.length || 1);
  const N = docs.length;

  // 预计算 idf
  const idf = Object.create(null);
  for (const term of Object.keys(df)) {
    idf[term] = Math.log(1 + (N - df[term] + 0.5) / (df[term] + 0.5));
  }

  return { docs, df, idf, avgdl, N };
}

/** BM25 打分 */
export function bm25Score(index, doc, queryTokens) {
  let score = 0;
  for (const term of queryTokens) {
    const f = doc.tf[term];
    if (!f) continue;
    const w = index.idf[term] || 0;
    score += w * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * doc.len) / index.avgdl)));
  }
  return score;
}

/** TF-IDF 向量 + 余弦相似度 */
export function tfidfVector(index, doc) {
  const vec = Object.create(null);
  for (const [term, f] of Object.entries(doc.tf)) {
    vec[term] = (1 + Math.log(f)) * (index.idf[term] || 0);
  }
  return vec;
}

export function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, v] of Object.entries(a)) {
    na += v * v;
    if (b[k]) dot += v * b[k];
  }
  for (const v of Object.values(b)) nb += v * v;
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * 混合检索
 * @param {object} index buildIndex 产物
 * @param {string} query 用户问题
 * @param {number} topK 返回条数
 * @param {{rewrite?: boolean, rerank?: boolean}} opts rewrite=同义扩展，rerank=词覆盖重排
 * @returns [{ id, docId, title, content, score, bm25, cosine }]
 */
export function search(index, query, topK = 5, opts = {}) {
  const { rewrite = true, rerank = true } = opts;
  const baseQuery = String(query || '');
  const searchQuery = rewrite ? expandQuery(baseQuery) : baseQuery;

  const qTokens = tokenize(searchQuery);
  if (!qTokens.length || !index.docs.length) return [];

  // 原始问题的词项：重排时用它衡量「真正命中多少」，避免同义扩展把分数灌水
  const baseTokens = [...new Set(tokenize(baseQuery).filter((t) => t.length > 1))];

  const qtf = termFreq(qTokens);
  const qVec = Object.create(null);
  for (const [term, f] of Object.entries(qtf)) {
    qVec[term] = (1 + Math.log(f)) * (index.idf[term] || 0);
  }

  const scored = index.docs.map((doc) => {
    const bm25 = bm25Score(index, doc, qTokens);
    const cos = cosine(qVec, tfidfVector(index, doc));
    // 归一化：BM25 长度不定，用 sigmoid 压到 0~1 再与余弦加权
    const bm25Norm = bm25 / (bm25 + 3);
    // 标题命中加权：问题里的词出现在标题上，说明这篇文档就是讲这个的
    const titleTokens = tokenize(doc.title || '');
    const hit = qTokens.filter((t) => titleTokens.includes(t) && t.length > 1).length;
    const titleBoost = Math.min(0.25, hit * 0.08);
    const score = 0.65 * bm25Norm + 0.35 * cos + titleBoost;

    // 重排信号：原始问题的不同词项在该块中出现了多少
    const coverage = baseTokens.length
      ? baseTokens.filter((t) => doc.tf[t]).length / baseTokens.length
      : 0;
    const finalScore = rerank ? 0.75 * score + 0.25 * coverage : score;

    return { ...doc, bm25, cosine: cos, coverage, score: finalScore, rawScore: score };
  });

  return scored
    .filter((d) => d.score > 0.01)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((d) => ({
      id: d.id,
      docId: d.docId,
      title: d.title,
      content: d.content,
      score: Math.round(d.score * 1000) / 1000,
      bm25: Math.round(d.bm25 * 100) / 100,
      cosine: Math.round(d.cosine * 1000) / 1000,
      coverage: Math.round(d.coverage * 100) / 100,
    }));
}
