import { Router } from 'express';
import { one, query } from '../db.js';
import { requireAuth, audit } from '../middleware/auth.js';
import { runDiagnosis, runChat } from '../ai/index.js';
import { hasRemoteAI } from '../config.js';

const router = Router();
router.use(requireAuth);

/** AI 服务状态 */
router.get('/status', (_req, res) => {
  res.json({
    code: 0,
    data: { remote: hasRemoteAI, provider: hasRemoteAI ? 'DeepSeek' : '内置规则引擎' },
  });
});

/** 辅助诊断 */
router.post('/diagnosis', async (req, res) => {
  const { symptoms, exams, age, gender, patientId, visitId } = req.body || {};
  if (!symptoms || String(symptoms).trim().length < 4) {
    return res.status(400).json({ code: 400, message: '请至少填写 4 个字的症状描述' });
  }
  const result = await runDiagnosis({ symptoms, exams, age, gender });
  const r = await query(
    `INSERT INTO diagnosis_sessions (visit_id, patient_id, doctor_id, symptoms, exams, result, risk, model)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [visitId || null, patientId || null, req.user.id, symptoms, exams || null, JSON.stringify(result), result.possibleDiagnoses?.[0]?.probability === '高' ? 2 : 1, result.model],
  );
  await audit(req, 'ai.diagnosis', 'diagnosis', r.insertId, `辅助诊断：${String(symptoms).slice(0, 60)}`);
  res.json({ code: 0, data: { ...result, sessionId: r.insertId } });
});

/** 新建会话 */
router.post('/chats', async (req, res) => {
  const r = await query('INSERT INTO ai_chats (user_id, title) VALUES (?, ?)', [
    req.user.id,
    (req.body?.title || '新会话').slice(0, 100),
  ]);
  res.json({ code: 0, data: { id: r.insertId, title: req.body?.title || '新会话' } });
});

/** 会话列表 */
router.get('/chats', async (req, res) => {
  const rows = await query(
    `SELECT c.*, (SELECT content FROM ai_messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message
     FROM ai_chats c WHERE c.user_id = ? ORDER BY c.updated_at DESC LIMIT 50`,
    [req.user.id],
  );
  res.json({ code: 0, data: rows });
});

/** 会话消息 */
router.get('/chats/:id/messages', async (req, res) => {
  const chat = await one('SELECT * FROM ai_chats WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!chat) return res.status(404).json({ code: 404, message: '会话不存在' });
  const rows = await query('SELECT * FROM ai_messages WHERE chat_id = ? ORDER BY id', [req.params.id]);
  res.json({ code: 0, data: { chat, messages: rows } });
});

/** 发送消息（自动建会话 + 多轮上下文） */
router.post('/chat', async (req, res) => {
  const { chatId, message } = req.body || {};
  if (!message || !String(message).trim()) {
    return res.status(400).json({ code: 400, message: '消息不能为空' });
  }
  let chat;
  if (chatId) {
    chat = await one('SELECT * FROM ai_chats WHERE id = ? AND user_id = ?', [chatId, req.user.id]);
    if (!chat) return res.status(404).json({ code: 404, message: '会话不存在' });
  } else {
    const title = String(message).trim().slice(0, 30);
    const r = await query('INSERT INTO ai_chats (user_id, title) VALUES (?, ?)', [req.user.id, title]);
    chat = { id: r.insertId, title };
  }

  await query('INSERT INTO ai_messages (chat_id, role, content) VALUES (?, "user", ?)', [chat.id, message]);
  const history = await query(
    'SELECT role, content FROM ai_messages WHERE chat_id = ? ORDER BY id DESC LIMIT 12',
    [chat.id],
  );
  const messages = history.reverse().map((m) => ({ role: m.role, content: m.content }));

  const reply = await runChat(messages);
  await query('INSERT INTO ai_messages (chat_id, role, content) VALUES (?, "assistant", ?)', [chat.id, reply.content]);
  await query('UPDATE ai_chats SET updated_at = NOW() WHERE id = ?', [chat.id]);
  await audit(req, 'ai.chat', 'chat', chat.id, String(message).slice(0, 60));

  res.json({ code: 0, data: { chatId: chat.id, content: reply.content, model: reply.model, source: reply.source } });
});

/** 删除会话 */
router.delete('/chats/:id', async (req, res) => {
  await query('DELETE FROM ai_chats WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.json({ code: 0, message: '会话已删除' });
});

/** 诊断历史 */
router.get('/diagnosis-history', async (req, res) => {
  const rows = await query(
    `SELECT d.id, d.symptoms, d.result, d.model, d.created_at, p.name AS patient_name
     FROM diagnosis_sessions d LEFT JOIN patients p ON p.id = d.patient_id
     WHERE d.doctor_id = ? ORDER BY d.id DESC LIMIT 30`,
    [req.user.id],
  );
  res.json({ code: 0, data: rows });
});

export default router;
