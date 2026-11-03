import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { localQC } from '../src/ai/local.js';

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'medai',
  charset: 'utf8mb4',
  dateStrings: true,
});

// 固定随机数，保证每次初始化数据一致
let seedState = 20260301;
const rand = () => {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

const DEPARTMENTS = [
  ['NK', '内科', 'clinical'],
  ['XNK', '心血管内科', 'clinical'],
  ['HXNK', '呼吸内科', 'clinical'],
  ['XHNK', '消化内科', 'clinical'],
  ['SJNK', '神经内科', 'clinical'],
  ['WK', '外科', 'clinical'],
  ['EK', '儿科', 'clinical'],
  ['FCK', '妇产科', 'clinical'],
  ['JZK', '急诊科', 'clinical'],
  ['JYK', '医学检验科', 'medical_tech'],
];

const USERS = [
  ['admin', 'admin123', '张明', 'admin', '信息科主任', 1, '13800000001'],
  ['quality', 'qc123456', '李静', 'quality', '质控科主治医师', 1, '13800000002'],
  ['doctor', 'doc123456', '王建国', 'clinician', '主任医师', 2, '13800000003'],
  ['chenxiao', 'doc123456', '陈晓', 'clinician', '副主任医师', 3, '13800000004'],
  ['liuyang', 'doc123456', '刘洋', 'clinician', '主治医师', 9, '13800000005'],
];

const PATIENTS = [
  ['陈运鑫', '男', '2002-05-18'], ['李秀兰', '女', '1958-03-12'], ['王德福', '男', '1949-11-02'],
  ['张桂英', '女', '1965-07-25'], ['刘建华', '男', '1972-01-15'], ['赵敏', '女', '1985-09-08'],
  ['孙丽娟', '女', '1990-12-30'], ['周国强', '男', '1968-04-20'], ['吴雅琴', '女', '1975-06-11'],
  ['郑海涛', '男', '1988-02-03'], ['冯玉梅', '女', '1955-08-17'], ['陈志强', '男', '1995-10-05'],
  ['褚红霞', '女', '1962-05-23'], ['卫东升', '男', '1979-03-09'], ['蒋文娟', '女', '1998-11-28'],
  ['沈国平', '男', '1951-07-14'], ['韩雪梅', '女', '1983-01-22'], ['杨立新', '男', '1970-09-16'],
  ['朱晓芳', '女', '2001-04-07'], ['秦大伟', '男', '1993-06-29'],
];

const CHIEF_COMPLAINTS = {
  2: ['反复胸闷、心悸 3 月，加重 1 天', '活动后胸痛 2 小时', '头晕伴血压升高 1 周'],
  3: ['咳嗽、咳痰伴发热 3 天', '反复气促 2 年，加重 3 天'],
  4: ['上腹部疼痛 1 天，伴恶心呕吐', '反复反酸、烧心半年'],
  5: ['突发眩晕 2 小时', '头痛伴右侧肢体乏力半天'],
  9: ['发热伴咽痛 1 天', '腹痛腹泻 6 小时'],
};

const PRESENT = [
  '患者 3 天前无明显诱因出现咳嗽、咳痰，为白色黏痰，伴发热，最高体温 38.6℃，自服退热药后可暂时缓解，夜间咳嗽加重，无明显呼吸困难，为进一步诊治来院。',
  '患者 2 小时前活动中突发胸骨后压榨性疼痛，持续约 10 分钟，休息后缓解，伴大汗、恶心，无放射痛，急诊查心电图提示 ST 段改变。',
  '患者 1 天前进食不洁食物后出现上腹部阵发性疼痛，伴恶心、呕吐 3 次，为胃内容物，无发热，无黑便，腹泻 2 次为稀水样便。',
  '患者半年来反复反酸、烧心，餐后明显，偶有胸骨后不适，未规律诊治，近期症状加重影响睡眠。',
  '患者 2 小时前起床时突发眩晕，视物旋转，伴恶心，无耳鸣，无肢体活动障碍，无言语不清。',
  '',
  '患者 1 周来头晕，测血压最高 165/100 mmHg，未规律服药，无头痛、无视力模糊。',
];

const PAST = ['既往高血压病史 10 年，规律服用氨氯地平；否认糖尿病史。', '否认高血压、糖尿病史，否认药物过敏史。', '既往胆囊结石病史 3 年，未手术。', ''];
const EXAM = [
  'T 38.2℃，P 96 次/分，R 20 次/分，BP 128/76 mmHg。双肺呼吸音粗，右下肺可闻及少许湿啰音。心律齐，腹软无压痛。',
  'T 36.5℃，P 88 次/分，BP 142/88 mmHg。双肺呼吸音清，心界不大，心律齐，各瓣膜听诊区未闻及病理性杂音。腹平软，无压痛。',
  'T 37.0℃，P 80 次/分，BP 120/75 mmHg。腹部平软，上腹部轻压痛，无反跳痛，肠鸣音活跃。',
  '神志清，查体合作，未见明显异常。',
];
const AUX = ['血常规：WBC 11.2×10⁹/L，中性粒细胞 78%，CRP 32 mg/L。胸部 CT：右下肺斑片状渗出影。', '心电图：V1-V4 导联 ST 段压低 0.1 mV。肌钙蛋白 I 0.02 ng/mL。', '腹部超声：胆囊壁毛糙，未见明显结石。血淀粉酶正常。', '未见异常。'];
const DX = ['社区获得性肺炎', '冠状动脉粥样硬化性心脏病 不稳定型心绞痛', '急性胃肠炎', '胃食管反流病', '后循环缺血', '原发性高血压 2 级'];
const TREAT = ['予抗感染、祛痰对症治疗，监测体温变化，3 天后复查血常规。', '予抗血小板、调脂、改善心肌供血治疗，收住院观察。', '予补液、止吐、调节肠道菌群治疗，清淡饮食。', '予抑酸、促动力治疗，4 周后复查胃镜。'];

const RULES = [
  ['C-001', '主诉缺失', 'completeness', 'critical', 22, '主诉为病历必填项，缺失将导致质控不通过'],
  ['C-002', '现病史缺失', 'completeness', 'critical', 22, '现病史需完整描述起病、演变与诊治经过'],
  ['C-003', '既往史缺失', 'completeness', 'major', 12, '既往史需说明慢性病史、手术史与过敏史'],
  ['C-004', '体格检查缺失', 'completeness', 'major', 12, '需记录生命体征与专科查体'],
  ['C-005', '辅助检查缺失', 'completeness', 'minor', 8, '有检查结果时应完整记录'],
  ['C-006', '处理意见缺失', 'completeness', 'major', 12, '需明确治疗方案与随访计划'],
  ['L-001', '主诉与现病史不一致', 'logic', 'major', 12, '现病史应围绕主诉展开'],
  ['L-002', '病程时间描述缺失', 'logic', 'major', 8, '现病史需写明起病时间与病程'],
  ['A-001', '诊断名称不规范', 'accuracy', 'major', 8, '应使用 ICD-10 标准诊断名称'],
  ['A-002', '检查结果与诊断不符', 'accuracy', 'major', 10, '诊断需有检查依据支撑'],
  ['T-001', '表述不规范', 'terminology', 'minor', 10, '避免“不舒服”“有点”等模糊表述'],
  ['T-002', '医学术语缩写未说明', 'terminology', 'minor', 5, '首次出现的缩写应给出全称'],
];

async function main() {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of ['audit_logs', 'ai_messages', 'ai_chats', 'diagnosis_sessions', 'qc_reports', 'qc_rules', 'medical_records', 'visits', 'patients', 'users', 'departments']) {
      await conn.query(`TRUNCATE TABLE ${t}`);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    for (const [code, name, type] of DEPARTMENTS) {
      await conn.query('INSERT INTO departments (code, name, dept_type) VALUES (?, ?, ?)', [code, name, type]);
    }
    console.log(`✔ 科室 ${DEPARTMENTS.length} 个`);

    const userIds = {};
    for (const [username, pwd, name, role, title, deptId, phone] of USERS) {
      const hash = await bcrypt.hash(pwd, 10);
      const [r] = await conn.query(
        'INSERT INTO users (username, password, name, role, title, dept_id, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [username, hash, name, role, title, deptId, phone],
      );
      userIds[username] = r.insertId;
    }
    console.log(`✔ 用户 ${USERS.length} 个`);

    for (const [code, name, cat, sev, weight, desc] of RULES) {
      await conn.query(
        'INSERT INTO qc_rules (code, name, category, severity, weight, description) VALUES (?, ?, ?, ?, ?, ?)',
        [code, name, cat, sev, weight, desc],
      );
    }
    console.log(`✔ 质控规则 ${RULES.length} 条`);

    const patientIds = [];
    for (let i = 0; i < PATIENTS.length; i++) {
      const [name, gender, birth] = PATIENTS[i];
      const [r] = await conn.query(
        'INSERT INTO patients (mrn, name, gender, birth_date, id_card, phone, blood_type, allergy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          `MRN${String(20260001 + i)}`,
          name,
          gender,
          birth,
          `3601${randInt(10, 99)}${birth.replace(/-/g, '').slice(2)}${randInt(1000, 9999)}`,
          `1${randInt(30, 89)}${randInt(10000000, 99999999)}`,
          pick(['A', 'B', 'O', 'AB']),
          pick(['青霉素过敏', '否认药物过敏', '磺胺类过敏', null]),
        ],
      );
      patientIds.push(r.insertId);
    }
    console.log(`✔ 患者 ${patientIds.length} 名`);

    const clinicalDepts = [2, 3, 4, 5, 9];
    const doctors = [userIds.doctor, userIds.chenxiao, userIds.liuyang];
    const recordIds = [];

    for (let i = 0; i < 36; i++) {
      const patientId = patientIds[i % patientIds.length];
      const deptId = pick(clinicalDepts);
      const doctorId = pick(doctors);
      const days = i % 7; // 分布在最近 7 天（含今天），保证趋势图有数据
      const visitTime = fmt(new Date(daysAgo(days).getTime() + (6 + (i % 8)) * 3600_000));

      const [vr] = await conn.query(
        `INSERT INTO visits (visit_no, patient_id, dept_id, doctor_id, visit_type, chief_complaint, diagnosis, visit_time, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'closed')`,
        [
          `V${String(202601000 + i)}`,
          patientId,
          deptId,
          doctorId,
          pick(['outpatient', 'outpatient', 'emergency', 'inpatient']),
          pick(CHIEF_COMPLAINTS[deptId] || CHIEF_COMPLAINTS[2]),
          pick(DX),
          visitTime,
        ],
      );

      // 20% 病历故意缺失字段，用于展示质控能力
      const quality = rand();
      const missing = quality < 0.2;
      const vague = quality > 0.2 && quality < 0.45;

      const record = {
        chief_complaint: pick(CHIEF_COMPLAINTS[deptId] || CHIEF_COMPLAINTS[2]),
        present_illness: missing ? '' : (vague ? pick(PRESENT).replace(/[\u4e00-\u9fa5]{0,6}前/g, '前段时间') : pick(PRESENT)),
        past_history: rand() > 0.25 ? pick(PAST) : '',
        physical_exam: vague ? '神志清，一般情况可，未见明显异常。' : pick(EXAM),
        auxiliary_exam: rand() > 0.2 ? pick(AUX) : '',
        diagnosis: pick(DX),
        treatment: rand() > 0.15 ? pick(TREAT) : '',
      };

      const [rr] = await conn.query(
        `INSERT INTO medical_records
         (visit_id, patient_id, doctor_id, chief_complaint, present_illness, past_history,
          physical_exam, auxiliary_exam, diagnosis, treatment, status, submitted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?)`,
        [
          vr.insertId, patientId, doctorId,
          record.chief_complaint, record.present_illness, record.past_history,
          record.physical_exam, record.auxiliary_exam, record.diagnosis, record.treatment,
          visitTime, visitTime, visitTime,
        ],
      );
      recordIds.push({ id: rr.insertId, record, createdAt: visitTime });

      const qc = localQC(record);
      const qcTime = fmt(new Date(new Date(visitTime).getTime() + 3600_000));
      await conn.query(
        `INSERT INTO qc_reports
         (record_id, score, level, dim_completeness, dim_accuracy, dim_logic, dim_terminology,
          risk, issues, suggestions, summary, model, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rule-engine', ?, ?)`,
        [
          rr.insertId, qc.score, qc.level,
          qc.dimensions.completeness, qc.dimensions.accuracy, qc.dimensions.logic, qc.dimensions.terminology,
          qc.risk, JSON.stringify(qc.issues), JSON.stringify(qc.suggestions), qc.summary,
          randInt(120, 480), qcTime,
        ],
      );
      await conn.query('UPDATE medical_records SET status = ?, updated_at = ? WHERE id = ?', [
        qc.score >= 80 ? 'qc_passed' : 'qc_failed', visitTime, rr.insertId,
      ]);
    }
    console.log(`✔ 就诊/病历 ${recordIds.length} 份（含 AI 质控报告）`);

    // 辅助诊断历史
    for (let i = 0; i < 8; i++) {
      await conn.query(
        `INSERT INTO diagnosis_sessions (patient_id, doctor_id, symptoms, exams, result, risk, model, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'rule-engine', ?)`,
        [
          patientIds[i], pick(doctors),
          pick(['发热咳嗽 3 天，伴咽痛', '活动后胸痛，休息可缓解', '上腹痛伴恶心呕吐', '头晕伴血压升高']),
          pick(['血常规 WBC 升高', '心电图 ST 段压低', '腹部超声未见异常']),
          JSON.stringify({ mock: true }),
          randInt(1, 2), fmt(daysAgo(randInt(0, 6))),
        ],
      );
    }

    // AI 会话
    const [chat1] = await conn.query('INSERT INTO ai_chats (user_id, title) VALUES (?, ?)', [userIds.doctor, '高血压患者用药注意事项']);
    await conn.query('INSERT INTO ai_messages (chat_id, role, content) VALUES (?, "user", ?)', [chat1.insertId, '老年高血压患者使用 ACEI 需要注意什么？']);
    await conn.query('INSERT INTO ai_messages (chat_id, role, content) VALUES (?, "assistant", ?)', [
      chat1.insertId,
      '老年患者使用 ACEI 类药物的要点：\n1. 起始剂量宜小，逐步滴定，避免首剂低血压；\n2. 用药前及用药后 1-2 周监测血肌酐与血钾；\n3. 双侧肾动脉狭窄、高钾血症、妊娠患者禁用；\n4. 出现干咳可考虑换用 ARB。\n\n具体方案请结合患者肾功能与合并用药，由主管医师决定。',
    ]);

    // 审计日志
    const actions = [
      ['login', 'user', '登录系统'],
      ['record.qc', 'record', 'AI 质控得分 86.5（B级）'],
      ['patient.create', 'patient', '新增患者 陈运鑫'],
      ['ai.diagnosis', 'diagnosis', '辅助诊断：发热咳嗽 3 天'],
      ['rule.update', 'qc_rule', '更新规则 主诉缺失'],
    ];
    for (let i = 0; i < 40; i++) {
      const [action, type, detail] = pick(actions);
      await conn.query(
        'INSERT INTO audit_logs (user_id, user_name, action, target_type, target_id, detail, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [userIds.quality, '李静', action, type, randInt(1, 30), detail, '127.0.0.1', fmt(daysAgo(randInt(0, 6)))],
      );
    }

    console.log('✔ 辅助诊断 / AI 会话 / 审计日志已生成');
  } finally {
    conn.release();
    await pool.end();
  }

  console.log('\n========== 演示账号 ==========');
  console.log('管理员   admin    / admin123');
  console.log('质控医师 quality  / qc123456');
  console.log('临床医师 doctor   / doc123456');
  console.log('==============================\n');
}

main().catch((err) => {
  console.error('种子数据写入失败：', err);
  process.exit(1);
});
