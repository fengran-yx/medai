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

/**
 * 领域同义词扩展：把口语化提问映射到规范术语
 * 例如用户问「查体写什么」，文档里写的是「体格检查」，不扩展就召不回。
 * 生产环境可换成 LLM 改写或搜索日志挖掘，这里先用可解释的规则表。
 */
const SYNONYMS = {
  主诉: ['主诉', '症状', '就诊'],
  现病史: ['现病史', '起病', '演变', '诊治经过'],
  既往史: ['既往史', '疾病史', '过敏史'],
  查体: ['查体', '体格检查', '生命体征', '血压'],
  体格检查: ['体格检查', '查体', '生命体征'],
  辅助检查: ['辅助检查', '检验', '影像'],
  诊断: ['诊断', '编码', 'icd-10'],
  处理意见: ['处理意见', '治疗', '用药', '随访'],
  评分: ['评分', '扣分', '维度', '权重'],
  质控: ['质控', '评分', '扣分', '缺陷'],
  封顶: ['封顶', '上限', '最高'],
  首诊: ['首诊', '负责'],
  查房: ['查房', '主任医师', '主治医师'],
  死亡病例: ['死亡病例', '讨论'],
  会诊: ['会诊', '急会诊', '到位'],
  保存: ['保存', '年限', '病历管理'],
  手术安全核查: ['手术', '核查', '三方'],
  危急值: ['危急值', '报告', '复述'],
  疑难病例: ['疑难病例', '讨论'],
  病程记录: ['病程记录', '复制'],
  抗菌药物: ['抗菌药物', '分级', '特殊使用级'],
  围手术期: ['围手术期', '术前', '预防用药'],
  处方: ['处方', '点评', '临床诊断'],
  主要诊断: ['主要诊断', '主诊断'],
  缩写: ['缩写', '外文缩写', '全称'],
  分期: ['分期', '分型'],
  肿瘤: ['肿瘤', '病理'],
};

/** 查询扩展：命中任一关键词就补充其同义词 */
export function expandQuery(query) {
  const q = String(query || '');
  const extra = new Set();
  for (const [key, terms] of Object.entries(SYNONYMS)) {
    if (q.includes(key)) terms.forEach((t) => extra.add(t));
  }
  if (!extra.size) return q;
  return `${q} ${[...extra].join(' ')}`;
}
