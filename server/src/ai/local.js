/**
 * 本地离线质控引擎（规则引擎）
 * 作用：在没有配置 DeepSeek Key 时，仍能给出可信、可解释的病历质控结果；
 *       配置了 Key 时作为大模型结果的兜底与校验基准。
 */

const FIELDS = [
  { key: 'chief_complaint', label: '主诉', min: 6 },
  { key: 'present_illness', label: '现病史', min: 20 },
  { key: 'past_history', label: '既往史', min: 2 },
  { key: 'physical_exam', label: '体格检查', min: 6 },
  { key: 'auxiliary_exam', label: '辅助检查', min: 2 },
  { key: 'diagnosis', label: '诊断', min: 2 },
  { key: 'treatment', label: '处理意见', min: 2 },
];

const VAGUE_WORDS = ['不舒服', '有点', '大概', '可能吧', '差不多', '不太清楚', '感觉不适', '未见明显异常'];
const ABNORMAL_HINT = ['疼痛', '发热', '咳嗽', '腹泻', '呕吐', '头晕', '乏力', '胸闷', '气促', '水肿', '皮疹', '出血'];

function text(v) {
  return String(v ?? '').trim();
}

function issue(ruleCode, rule, severity, field, message, suggestion) {
  return { ruleCode, rule, severity, field, message, suggestion };
}

/** 规则引擎打分，返回与 AI 相同结构的结果 */
export function localQC(record) {
  const issues = [];
  const dims = { completeness: 100, accuracy: 100, logic: 100, terminology: 100 };

  // 1. 完整性
  for (const f of FIELDS) {
    const value = text(record[f.key]);
    if (!value) {
      const critical = ['chief_complaint', 'present_illness', 'diagnosis'].includes(f.key);
      dims.completeness -= critical ? 35 : 18;
      issues.push(
        issue(
          `C-${f.key.toUpperCase()}`,
          `${f.label}缺失`,
          critical ? 'critical' : 'major',
          f.key,
          `${f.label}未填写，属于必填项`,
          `请补充${f.label}相关内容，保证病历要素完整`,
        ),
      );
    } else if (value.length < f.min) {
      dims.completeness -= 10;
      issues.push(
        issue(
          `C-${f.key.toUpperCase()}-SHORT`,
          `${f.label}过于简略`,
          'minor',
          f.key,
          `${f.label}仅 ${value.length} 字，信息量不足`,
          `${f.label}建议写清时间、部位、程度、伴随症状等要素`,
        ),
      );
    }
  }

  // 2. 逻辑一致性：主诉症状应在现病史中出现
  const cc = text(record.chief_complaint);
  const pi = text(record.present_illness);
  if (cc && pi) {
    const hits = ABNORMAL_HINT.filter((w) => cc.includes(w));
    const missing = hits.filter((w) => !pi.includes(w));
    if (missing.length) {
      dims.logic -= 12;
      issues.push(
        issue(
          'L-001',
          '主诉与现病史不一致',
          'major',
          'present_illness',
          `主诉中的「${missing.join('、')}」在现病史中未描述`,
          '现病史需围绕主诉展开，说明起病时间、诱因、演变过程',
        ),
      );
    }
    if (!/[0-9一二三四五六七八九十]+\s*(天|日|周|月|年|小时|分钟)/.test(pi)) {
      dims.logic -= 8;
      issues.push(
        issue(
          'L-002',
          '现病史缺少时间要素',
          'major',
          'present_illness',
          '现病史未描述病程时间',
          '补充起病时间与病程（如“3 天前”“反复 2 月余”）',
        ),
      );
    }
  }

  // 3. 术语规范
  const allText = FIELDS.map((f) => text(record[f.key])).join(' ');
  const vague = VAGUE_WORDS.filter((w) => allText.includes(w));
  if (vague.length) {
    dims.terminology -= 10;
    issues.push(
      issue(
        'T-001',
        '表述不规范',
        'minor',
        'present_illness',
        `存在模糊表述：${vague.join('、')}`,
        '使用规范医学术语描述症状性质、程度与持续时间',
      ),
    );
  }
  if (text(record.diagnosis) && !/[A-Z]?\d{2}(\.\d+)?/.test(text(record.diagnosis)) && text(record.diagnosis).length < 6) {
    dims.accuracy -= 8;
    issues.push(
      issue(
        'A-001',
        '诊断名称不规范',
        'major',
        'diagnosis',
        '诊断名称过短，无法对应标准疾病编码',
        '建议使用 ICD-10 标准诊断名称，必要时附编码',
      ),
    );
  }

  // 4. 辅助检查与诊断匹配
  if (text(record.auxiliary_exam) && /正常|未见异常/.test(text(record.auxiliary_exam)) && /炎|感染|骨折|梗死/.test(text(record.diagnosis))) {
    dims.accuracy -= 10;
    issues.push(
      issue(
        'A-002',
        '检查结果与诊断不符',
        'major',
        'diagnosis',
        '辅助检查未见异常，但诊断提示炎性/器质性病变',
        '请复核检查结果或补充影像/实验室依据',
      ),
    );
  }

  const clamp = (n) => Math.max(40, Math.min(100, Math.round(n)));
  const dimensions = {
    completeness: clamp(dims.completeness),
    accuracy: clamp(dims.accuracy),
    logic: clamp(dims.logic),
    terminology: clamp(dims.terminology),
  };

  const weights = { completeness: 0.4, accuracy: 0.3, logic: 0.2, terminology: 0.1 };
  const base = Object.entries(weights).reduce((sum, [k, w]) => sum + dimensions[k] * w, 0);

  // 严重问题额外扣分，并设置上限，避免“缺项病历”仍拿高分
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const majorCount = issues.filter((i) => i.severity === 'major').length;
  const minorCount = issues.filter((i) => i.severity === 'minor').length;
  let score = base - criticalCount * 8 - majorCount * 3 - minorCount * 1;
  if (criticalCount > 0) score = Math.min(score, 72);
  if (majorCount >= 3) score = Math.min(score, 86);
  score = Math.round(score * 10) / 10;

  const level = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 60 ? 'C' : 'D';
  const risk = issues.some((i) => i.severity === 'critical') ? 3 : issues.some((i) => i.severity === 'major') ? 2 : issues.length ? 1 : 0;

  const suggestions = [...new Set(issues.map((i) => i.suggestion))].slice(0, 6);
  const summary =
    issues.length === 0
      ? '病历要素完整、逻辑一致、术语规范，未见明显质控问题，可直接归档。'
      : `本次质控发现 ${issues.length} 处问题，其中严重 ${issues.filter((i) => i.severity === 'critical').length} 项、`
        + `主要 ${issues.filter((i) => i.severity === 'major').length} 项。建议按问题清单逐项修订后再提交归档。`;

  return {
    score,
    level,
    dimensions,
    risk,
    issues,
    suggestions,
    summary,
    source: 'rule-engine',
  };
}

/** 症状关键词 -> 鉴别诊断知识库（离线辅助诊断） */
const DX_LIBRARY = [
  {
    match: ['发热', '咳嗽', '咳痰', '咽痛'],
    items: [
      { name: '急性上呼吸道感染', icd: 'J06.9', probability: '高', basis: '发热伴咳嗽/咽痛，符合上呼吸道感染典型表现' },
      { name: '社区获得性肺炎', icd: 'J18.9', probability: '中', basis: '需结合胸部影像与炎症指标，警惕下呼吸道感染' },
      { name: '流行性感冒', icd: 'J11.1', probability: '中', basis: '流感季节需鉴别，可查流感抗原' },
    ],
    exams: ['血常规 + CRP', '胸部正位片或胸部 CT', '流感病毒抗原检测'],
    redFlags: ['持续高热 > 3 天', '呼吸频率 > 24 次/分或血氧 < 93%', '出现意识改变'],
  },
  {
    match: ['胸痛', '胸闷', '心悸', '气促'],
    items: [
      { name: '冠状动脉粥样硬化性心脏病', icd: 'I25.1', probability: '中', basis: '胸痛需优先排除心源性因素，结合心电图与肌钙蛋白' },
      { name: '不稳定型心绞痛', icd: 'I20.0', probability: '中', basis: '静息或进行性加重的胸痛需警惕急性冠脉综合征' },
      { name: '胃食管反流病', icd: 'K21.0', probability: '低', basis: '胸骨后烧灼感、餐后加重时考虑' },
    ],
    exams: ['18 导联心电图（10 分钟内）', '心肌肌钙蛋白 + CK-MB', '心脏超声'],
    redFlags: ['胸痛持续 > 20 分钟不缓解', '伴大汗、濒死感', '血流动力学不稳定'],
  },
  {
    match: ['腹痛', '腹泻', '恶心', '呕吐'],
    items: [
      { name: '急性胃肠炎', icd: 'A09.9', probability: '高', basis: '腹痛伴腹泻/呕吐，多有饮食不洁史' },
      { name: '急性阑尾炎', icd: 'K35.8', probability: '中', basis: '转移性右下腹痛、麦氏点压痛时需考虑' },
      { name: '肠梗阻', icd: 'K56.7', probability: '低', basis: '腹胀、停止排气排便需警惕' },
    ],
    exams: ['血常规 + 电解质', '腹部立位平片 / 腹部超声', '粪常规 + 隐血'],
    redFlags: ['腹膜刺激征', '血压下降或休克表现', '呕血/黑便'],
  },
  {
    match: ['头晕', '头痛', '眩晕'],
    items: [
      { name: '原发性高血压', icd: 'I10', probability: '中', basis: '需测量双上肢血压并评估靶器官损害' },
      { name: '后循环缺血', icd: 'G45.0', probability: '中', basis: '伴复视、构音障碍、共济失调时需警惕' },
      { name: '偏头痛', icd: 'G43.9', probability: '低', basis: '搏动性头痛伴畏光畏声时考虑' },
    ],
    exams: ['血压监测', '头颅 CT/MRI', '颈动脉超声'],
    redFlags: ['突发剧烈头痛（雷击样）', '伴肢体无力或言语不清', '新发神经系统体征'],
  },
  {
    match: ['血糖', '多饮', '多尿', '消瘦'],
    items: [
      { name: '2 型糖尿病', icd: 'E11.9', probability: '高', basis: '多饮多尿伴体重下降，符合糖代谢异常表现' },
      { name: '糖尿病酮症酸中毒', icd: 'E11.1', probability: '低', basis: '血糖显著升高伴恶心呕吐、深大呼吸时需警惕' },
    ],
    exams: ['空腹血糖 + 糖化血红蛋白', '尿常规（尿酮体）', '血气分析（必要时）'],
    redFlags: ['血糖 > 16.7 mmol/L 伴酮体阳性', '意识障碍', '严重脱水'],
  },
];

const DEFAULT_DX = {
  items: [
    { name: '需结合完整病史进一步明确', icd: 'R69', probability: '待定', basis: '当前信息不足以形成倾向性判断' },
  ],
  exams: ['血常规', 'C 反应蛋白', '生化全套', '根据主诉补充针对性检查'],
  redFlags: ['生命体征不稳定', '症状进行性加重', '出现新的神经系统或循环系统体征'],
};

/** 离线辅助诊断 */
export function localDiagnosis({ symptoms = '', exams = '', age = null, gender = '' }) {
  const input = `${symptoms} ${exams}`;
  const hit = DX_LIBRARY.find((d) => d.match.some((w) => input.includes(w))) || DEFAULT_DX;
  const items = hit.items.map((it, idx) => ({
    ...it,
    rank: idx + 1,
    note: age ? `结合患者年龄 ${age} 岁${gender ? `、${gender}` : ''}综合评估` : '',
  }));

  return {
    possibleDiagnoses: items,
    recommendedExams: hit.exams,
    redFlags: hit.redFlags,
    triage:
      hit === DEFAULT_DX
        ? '信息不足，建议补充主诉、病程与关键体征后再次评估'
        : items[0].probability === '高'
          ? '建议门诊常规处理，完善检查后复诊'
          : '建议优先完善检查，必要时专科会诊',
    disclaimer: '本结果由 AI 依据有限文本生成，仅供临床参考，不能替代医师面诊与最终诊断。',
    source: 'rule-engine',
  };
}

/** 离线问答 */
export function localChat(question = '') {
  const q = question.trim();
  if (!q) return '请描述您想咨询的医学问题或需要协助的病历处理事项。';
  if (/质控|病历质量|评分/.test(q)) {
    return '病历质控主要从四个维度评估：\n1. 完整性：主诉、现病史、既往史、查体、辅助检查、诊断、处理意见是否齐全；\n2. 准确性：诊断与检查结果、用药是否匹配；\n3. 逻辑性：主诉与现病史是否一致，病程时间是否清晰；\n4. 规范性：是否使用标准医学术语与 ICD-10 诊断名称。\n\n可在「病历质控」页选择病历后一键运行 AI 质控，查看逐条问题与修改建议。';
  }
  if (/高血压|血压/.test(q)) {
    return '高血压管理要点：\n· 诊断：非同日 3 次诊室血压 ≥ 140/90 mmHg；\n· 评估：关注心、脑、肾、眼底等靶器官损害；\n· 治疗：生活方式干预 + 个体化降压药物，一般目标 < 140/90 mmHg，老年或高危患者需个体化；\n· 随访：监测血压、电解质与肾功能。\n\n以上为通用医学知识，具体用药请遵循临床指南与患者实际情况。';
  }
  if (/糖尿病|血糖/.test(q)) {
    return '糖尿病诊疗要点：\n· 诊断：空腹血糖 ≥ 7.0 mmol/L，或 OGTT 2h ≥ 11.1 mmol/L，或 HbA1c ≥ 6.5%；\n· 评估：筛查并发症（眼底、尿微量白蛋白、神经病变、足部）；\n· 管理：饮食运动为基础，结合降糖药物，个体化设定 HbA1c 目标；\n· 急症：警惕酮症酸中毒与低血糖。\n\n具体方案需结合患者情况由医师制定。';
  }
  return `关于「${q.slice(0, 40)}」：\n\n当前为离线知识引擎模式（未配置 DeepSeek API Key），可提供通用医学知识与系统操作指引。\n\n建议：\n1. 在「AI 辅助诊断」中录入症状与检查，获取结构化鉴别诊断建议；\n2. 在「病历质控」中对病历运行 AI 评分，查看完整性问题清单；\n3. 配置 DEEPSEEK_API_KEY 后，可获得更贴近临床语境的分析。\n\n提示：AI 输出仅供临床参考，最终诊疗决策由医师负责。`;
}
