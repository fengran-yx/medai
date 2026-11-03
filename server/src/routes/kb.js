import { Router } from 'express';
import { requireAuth, requireRole, audit } from '../middleware/auth.js';
import {
  answerQuestion,
  deleteDocument,
  ingestDocument,
  listDocuments,
  searchKnowledge,
  stats,
} from '../kb/service.js';

const router = Router();
router.use(requireAuth);

/** 知识库统计 */
router.get('/stats', async (_req, res) => {
  res.json({ code: 0, data: await stats() });
});

/** 文档列表 */
router.get('/documents', async (_req, res) => {
  res.json({ code: 0, data: await listDocuments() });
});

/** 新增文档（自动切块 + 建索引） */
router.post('/documents', requireRole('admin', 'quality'), async (req, res) => {
  const { title, category, source, content } = req.body || {};
  if (!title || !content) {
    return res.status(400).json({ code: 400, message: '标题与正文为必填项' });
  }
  if (String(content).length < 30) {
    return res.status(400).json({ code: 400, message: '正文太短，至少 30 字' });
  }
  const result = await ingestDocument({ title, category, source, content });
  await audit(req, 'kb.ingest', 'kb_document', result.id, `入库文档《${title}》(${result.chunkCount} 段)`);
  res.json({ code: 0, data: result, message: '文档已入库' });
});

/** 删除文档 */
router.delete('/documents/:id', requireRole('admin', 'quality'), async (req, res) => {
  const doc = await deleteDocument(Number(req.params.id));
  if (!doc) return res.status(404).json({ code: 404, message: '文档不存在' });
  await audit(req, 'kb.delete', 'kb_document', doc.id, `删除文档《${doc.title}》`);
  res.json({ code: 0, message: '文档已删除' });
});

/** 只检索，不生成（调试召回效果用） */
router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ code: 400, message: '缺少查询词 q' });
  const topK = Math.min(20, Math.max(1, Number(req.query.topK) || 5));
  const hits = await searchKnowledge(q, topK);
  res.json({ code: 0, data: hits });
});

/** 问答：检索 + 生成 + 带引用 */
router.post('/ask', async (req, res) => {
  const { question, topK } = req.body || {};
  if (!question || String(question).trim().length < 2) {
    return res.status(400).json({ code: 400, message: '请输入问题' });
  }
  const result = await answerQuestion({
    question: String(question).trim(),
    topK: Math.min(10, Math.max(1, Number(topK) || 5)),
    userId: req.user.id,
  });
  await audit(req, 'kb.ask', 'kb_qa', null, `提问：${String(question).slice(0, 50)}`);
  res.json({ code: 0, data: result });
});

export default router;
