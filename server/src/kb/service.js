/**
 * 知识库服务：入库（切块 + 稀疏向量）、检索、问答
 * 索引在内存中按需构建，写操作后失效重建；演示规模足够，生产可换 pgvector。
 */
import { one, query } from '../db.js';
import { chunkText, termFreq, tokenize } from './tokenize.js';
import { buildIndex, search } from './search.js';
import { runRagAnswer } from '../ai/index.js';

let cache = null; // { index, sig, builtAt }

/** 载入全部分块并建索引；用 (行数, 最大 id) 做签名，数据变了自动重建 */
export async function ensureIndex(force = false) {
  const sig = await one('SELECT COUNT(*) AS c, COALESCE(MAX(id), 0) AS m FROM kb_chunks');
  const signature = `${sig.c}-${sig.m}`;

  if (cache && !force && cache.sig === signature) return cache.index;

  const rows = await query(
    `SELECT c.id, c.doc_id AS docId, c.content, d.title, d.category
     FROM kb_chunks c JOIN kb_documents d ON d.id = c.doc_id`,
  );
  const index = buildIndex(rows);
  cache = { index, sig: signature, builtAt: Date.now() };
  return index;
}

export function invalidateIndex() {
  cache = null;
}

/** 入库：切块 → 存库 → 失效索引 */
export async function ingestDocument({ title, category = 'guideline', source = null, content }) {
  const docRes = await query(
    'INSERT INTO kb_documents (title, category, source, content) VALUES (?, ?, ?, ?)',
    [title, category, source, content],
  );
  const docId = docRes.insertId;

  const chunks = chunkText(content);
  for (const [i, text] of chunks.entries()) {
    const tf = termFreq(tokenize(text));
    await query(
      'INSERT INTO kb_chunks (doc_id, seq, content, token_cnt, embedding) VALUES (?, ?, ?, ?, ?)',
      [docId, i, text, tokenize(text).length, JSON.stringify(tf)],
    );
  }
  await query('UPDATE kb_documents SET chunk_count = ? WHERE id = ?', [chunks.length, docId]);
  invalidateIndex();

  return { id: docId, chunkCount: chunks.length };
}

/** 检索 */
export async function searchKnowledge(question, topK = 5) {
  const index = await ensureIndex();
  return search(index, question, topK);
}

/** 问答：检索 + 生成 + 落日志 */
export async function answerQuestion({ question, topK = 5, userId = null }) {
  const startedAt = Date.now();
  const hits = await searchKnowledge(question, topK);

  if (!hits.length) {
    return {
      answer: '知识库里没有检索到相关材料。可以换一种说法，或先在「知识库」里补充相关文档。',
      sources: [],
      model: 'none',
      latencyMs: Date.now() - startedAt,
    };
  }

  const result = await runRagAnswer({ question, contexts: hits });
  const latencyMs = Date.now() - startedAt;

  const sources = hits.map((h, i) => ({
    index: i + 1,
    docId: h.docId,
    title: h.title,
    score: h.score,
    snippet: h.content.slice(0, 120),
  }));

  await query(
    `INSERT INTO kb_qa_logs (user_id, question, answer, sources, model, latency_ms)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, String(question).slice(0, 500), result.content, JSON.stringify(sources), result.model, latencyMs],
  );

  return { answer: result.content, sources, model: result.model, latencyMs, source: result.source };
}

/** 文档列表 */
export async function listDocuments() {
  return query(
    `SELECT id, title, category, source, chunk_count, created_at,
            CHAR_LENGTH(content) AS chars
     FROM kb_documents ORDER BY id DESC`,
  );
}

/** 删除文档（分块级联删除） */
export async function deleteDocument(id) {
  const doc = await one('SELECT id, title FROM kb_documents WHERE id = ?', [id]);
  if (!doc) return null;
  await query('DELETE FROM kb_documents WHERE id = ?', [id]);
  invalidateIndex();
  return doc;
}

/** 知识库统计 */
export async function stats() {
  const docs = await one('SELECT COUNT(*) AS c FROM kb_documents');
  const chunks = await one('SELECT COUNT(*) AS c FROM kb_chunks');
  const asks = await one('SELECT COUNT(*) AS c FROM kb_qa_logs');
  return { documents: docs.c, chunks: chunks.c, questions: asks.c, indexedAt: cache?.builtAt || null };
}
