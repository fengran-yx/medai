/**
 * 中文友好的轻量分词：不依赖 jieba / 词典，用「单字 + 相邻双字」近似
 * 医学文本里大量术语是 2-4 字（肺炎、现病史、心绞痛），双字粒度召回够用且零依赖。
 * 英文/数字按词切分，统一小写。
 */

const CJK = /[\u4e00-\u9fa5]/;
const STOP = new Set([
  '的', '了', '和', '与', '或', '在', '是', '有', '为', '对', '及', '等', '中', '上', '下',
  '个', '这', '那', '也', '不', '就', '都', '而', '并', '被', '把', '从', '到', '以', '其',
  'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'is', 'are', 'for', 'on', 'with',
]);

/** 文本 → 词项数组 */
export function tokenize(text) {
  const s = String(text || '').toLowerCase();
  const tokens = [];

  // 连续中文片段：单字 + 双字
  const cjkRuns = s.match(/[\u4e00-\u9fa5]+/g) || [];
  for (const run of cjkRuns) {
    for (let i = 0; i < run.length; i++) {
      tokens.push(run[i]);
      if (i + 1 < run.length) tokens.push(run.slice(i, i + 2));
    }
  }

  // 英文 / 数字
  const words = s.match(/[a-z0-9][a-z0-9.%+-]*/g) || [];
  for (const w of words) {
    if (w.length >= 2) tokens.push(w);
  }

  return tokens.filter((t) => t.length > 0 && !STOP.has(t));
}

/** 词频表 {term: count} */
export function termFreq(tokens) {
  const tf = Object.create(null);
  for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
  return tf;
}

/** 把文本切成检索块：优先按段落，超长再按句号切，块间重叠 overlap 字符 */
export function chunkText(text, { maxLen = 260, overlap = 60 } = {}) {
  const clean = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];

  // 按行切段：医学文档里【主诉】【现病史】这类小标题独立成行，按行切能显著提升召回精度
  const paras = clean.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let buf = '';

  // 【xxx】、一、、1. 这类都视为新的小节，强制断块，避免不同主题混在一个块里稀释权重
  const isHeading = (p) => /^【|^[一二三四五六七八九十]+、|^\d+[.、]/.test(p);

  const flush = () => {
    if (buf.trim()) chunks.push(buf.trim());
    buf = '';
  };

  for (const p of paras) {
    if (isHeading(p)) flush();

    if (p.length > maxLen) {
      flush();
      // 长段落按句号/分号切
      const sentences = p.split(/(?<=[。；！？;])/).filter(Boolean);
      let acc = '';
      for (const s of sentences) {
        if ((acc + s).length > maxLen) {
          if (acc.trim()) chunks.push(acc.trim());
          acc = acc.slice(-overlap) + s;
        } else {
          acc += s;
        }
      }
      if (acc.trim()) chunks.push(acc.trim());
    } else if ((buf + '\n' + p).length > maxLen) {
      flush();
      buf = p;
    } else {
      buf = buf ? `${buf}\n${p}` : p;
    }
  }
  flush();

  return chunks.filter((c) => c.length >= 20);
}

export { CJK };
