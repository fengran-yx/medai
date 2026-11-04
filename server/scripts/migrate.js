/**
 * 增量数据库迁移（幂等）
 * 用法：npm run db:migrate
 *
 * 为什么需要它：schema.sql 会重建整个库，只适合首次初始化；
 * 已经跑起来的演示环境需要一种"不丢数据"的方式升级表结构。
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { hashAudit } from '../src/audit/hash.js';

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'medai',
  charset: 'utf8mb4',
  dateStrings: true,
});

const NEW_RULES = [
  ['C-007', '诊断缺失', 'completeness', 'critical', 20, '诊断是病历核心要素，缺失将导致质控不通过'],
  ['C-008', '病历字段过于简略', 'completeness', 'minor', 6, '各字段应包含足够信息量，避免一句话带过'],
];

async function hasTable(name) {
  const [rows] = await pool.query(
    'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    [name],
  );
  return rows.length > 0;
}

async function hasColumn(table, column) {
  const [rows] = await pool.query(
    'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
    [table, column],
  );
  return rows.length > 0;
}

async function hasIndex(table, index) {
  const [rows] = await pool.query(
    'SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?',
    [table, index],
  );
  return rows.length > 0;
}

const CREATE_RECORD_VERSIONS = `
CREATE TABLE IF NOT EXISTS record_versions (
  id          BIGINT      NOT NULL AUTO_INCREMENT,
  record_id   BIGINT      NOT NULL,
  version     INT         NOT NULL DEFAULT 1 COMMENT '同一病历内的版本号，从 1 递增',
  snapshot    JSON        NOT NULL COMMENT '质控时的病历字段快照',
  dimensions  JSON        DEFAULT NULL COMMENT '四维度得分快照',
  score       DECIMAL(5,1) DEFAULT NULL,
  level       VARCHAR(10) DEFAULT NULL,
  report_id   BIGINT      DEFAULT NULL COMMENT '对应的质控报告ID',
  source      VARCHAR(20) NOT NULL DEFAULT 'qc' COMMENT 'qc/manual',
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_rv_record_version (record_id, version),
  KEY idx_rv_record_created (record_id, created_at),
  CONSTRAINT fk_rv_record FOREIGN KEY (record_id) REFERENCES medical_records (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='病历质控版本快照'`;

const CREATE_QC_BATCHES = `
CREATE TABLE IF NOT EXISTS qc_batches (
  id          BIGINT      NOT NULL AUTO_INCREMENT,
  user_id     BIGINT      DEFAULT NULL,
  user_name   VARCHAR(50) DEFAULT NULL,
  total       INT         NOT NULL DEFAULT 0,
  done        INT         NOT NULL DEFAULT 0,
  failed      INT         NOT NULL DEFAULT 0,
  improved    INT         NOT NULL DEFAULT 0 COMMENT '分数提升的病历数',
  avg_delta   DECIMAL(5,1) DEFAULT NULL COMMENT '平均提升分',
  status      VARCHAR(20) NOT NULL DEFAULT 'queued' COMMENT 'queued/running/done/failed',
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME    DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_batch_user (user_id),
  KEY idx_batch_created (created_at)
) ENGINE=InnoDB COMMENT='批量质控任务'`;

const CREATE_QC_BATCH_ITEMS = `
CREATE TABLE IF NOT EXISTS qc_batch_items (
  id         BIGINT      NOT NULL AUTO_INCREMENT,
  batch_id   BIGINT      NOT NULL,
  record_id  BIGINT      NOT NULL,
  status     VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending/running/ok/failed',
  score      DECIMAL(5,1) DEFAULT NULL,
  level      VARCHAR(10) DEFAULT NULL,
  report_id  BIGINT      DEFAULT NULL,
  error      VARCHAR(300) DEFAULT NULL,
  ms         INT         DEFAULT NULL,
  updated_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_batch_item (batch_id, record_id),
  KEY idx_batch_item_status (batch_id, status),
  CONSTRAINT fk_bi_batch FOREIGN KEY (batch_id) REFERENCES qc_batches (id) ON DELETE CASCADE,
  CONSTRAINT fk_bi_record FOREIGN KEY (record_id) REFERENCES medical_records (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='批量质控明细'`;

const CREATE_RECTIFY_TASKS = `
CREATE TABLE IF NOT EXISTS rectify_tasks (
  id          BIGINT      NOT NULL AUTO_INCREMENT,
  record_id   BIGINT      NOT NULL,
  report_id   BIGINT      DEFAULT NULL,
  doctor_id   BIGINT      DEFAULT NULL,
  dept_id     BIGINT      DEFAULT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'open' COMMENT 'open/submitted/passed/closed',
  due_at      DATETIME    NOT NULL COMMENT '整改截止时间',
  note        VARCHAR(500) DEFAULT NULL,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  closed_at   DATETIME    DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_task_record (record_id, status),
  KEY idx_task_status (status, due_at),
  KEY idx_task_doctor (doctor_id),
  CONSTRAINT fk_task_record FOREIGN KEY (record_id) REFERENCES medical_records (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='病历整改任务'`;

const CREATE_AUDIT_CHAIN = `
CREATE TABLE IF NOT EXISTS audit_chain (
  id        TINYINT     NOT NULL DEFAULT 1,
  last_id   BIGINT      NOT NULL DEFAULT 0,
  last_hash CHAR(64)    NOT NULL DEFAULT '',
  updated_at DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB COMMENT='审计哈希链头'`;

/** 重建审计链（旧库升级或链头缺失时） */
async function backfillAudit(conn) {
  await conn.query("INSERT INTO audit_chain (id, last_id, last_hash) VALUES (1, 0, '') ON DUPLICATE KEY UPDATE id = id");
  const [rows] = await conn.query(
    `SELECT id, user_id, user_name, action, target_type, target_id, detail, ip, created_at
     FROM audit_logs ORDER BY id ASC`,
  );
  let prevHash = '';
  for (const row of rows) {
    const hash = hashAudit(row, prevHash);
    await conn.query('UPDATE audit_logs SET prev_hash = ?, hash = ? WHERE id = ?', [prevHash, hash, row.id]);
    prevHash = hash;
  }
  const lastId = rows.length ? rows[rows.length - 1].id : 0;
  await conn.query('UPDATE audit_chain SET last_id = ?, last_hash = ? WHERE id = 1', [lastId, prevHash]);
  return rows.length;
}

async function main() {
  const created = [];
  if (!(await hasTable('record_versions'))) {
    await pool.query(CREATE_RECORD_VERSIONS);
    created.push('record_versions');
  }
  if (!(await hasTable('qc_batches'))) {
    await pool.query(CREATE_QC_BATCHES);
    created.push('qc_batches');
  }
  if (!(await hasTable('qc_batch_items'))) {
    await pool.query(CREATE_QC_BATCH_ITEMS);
    created.push('qc_batch_items');
  }
  if (!(await hasTable('rectify_tasks'))) {
    await pool.query(CREATE_RECTIFY_TASKS);
    created.push('rectify_tasks');
  }
  if (!(await hasTable('audit_chain'))) {
    await pool.query(CREATE_AUDIT_CHAIN);
    created.push('audit_chain');
  }

  let addedReview = false;
  const columns = [
    ['qc_reports', 'prev_score', 'DECIMAL(5,1) DEFAULT NULL COMMENT \'上一次质控得分\' AFTER duration_ms'],
    ['qc_reports', 'score_delta', 'DECIMAL(5,1) DEFAULT NULL COMMENT \'本次得分 - 上一次得分\' AFTER prev_score'],
    ['qc_reports', 'record_version', 'INT DEFAULT NULL COMMENT \'对应的病历版本号\' AFTER score_delta'],
    ['users', 'failed_attempts', 'TINYINT NOT NULL DEFAULT 0 COMMENT \'连续登录失败次数\' AFTER status'],
    ['users', 'locked_until', 'DATETIME DEFAULT NULL COMMENT \'锁定截止时间\' AFTER failed_attempts'],
    ['users', 'token_version', 'INT NOT NULL DEFAULT 0 COMMENT \'会话版本\' AFTER locked_until'],
    ['users', 'wechat_openid', 'VARCHAR(64) DEFAULT NULL COMMENT \'微信小程序 openid\' AFTER token_version'],
    ['users', 'wechat_unionid', 'VARCHAR(64) DEFAULT NULL COMMENT \'微信 unionid\' AFTER wechat_openid'],
    ['users', 'wecom_userid', 'VARCHAR(64) DEFAULT NULL COMMENT \'企业微信 userid\' AFTER wechat_unionid'],
    ['users', 'wechat_bound_at', 'DATETIME DEFAULT NULL COMMENT \'微信绑定时间\' AFTER wecom_userid'],
    ['qc_reports', 'review_status', 'VARCHAR(20) NOT NULL DEFAULT \'pending\' COMMENT \'pending/confirmed/overridden\' AFTER record_version'],
    ['qc_reports', 'reviewer_id', 'BIGINT DEFAULT NULL AFTER review_status'],
    ['qc_reports', 'reviewer_name', 'VARCHAR(50) DEFAULT NULL AFTER reviewer_id'],
    ['qc_reports', 'reviewed_at', 'DATETIME DEFAULT NULL AFTER reviewer_name'],
    ['qc_reports', 'final_score', 'DECIMAL(5,1) DEFAULT NULL AFTER reviewed_at'],
    ['qc_reports', 'review_note', 'VARCHAR(500) DEFAULT NULL AFTER final_score'],
    ['audit_logs', 'prev_hash', 'CHAR(64) DEFAULT NULL AFTER ip'],
    ['audit_logs', 'hash', 'CHAR(64) DEFAULT NULL AFTER prev_hash'],
  ];
  for (const [table, column, ddl] of columns) {
    if (!(await hasColumn(table, column))) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
      created.push(`${table}.${column}`);
      if (table === 'qc_reports' && column === 'review_status') addedReview = true;
    }
  }

  if (!(await hasIndex('qc_reports', 'idx_qc_review'))) {
    await pool.query('ALTER TABLE qc_reports ADD KEY idx_qc_review (review_status, id)');
    created.push('qc_reports.idx_qc_review');
  }

  if (!(await hasIndex('users', 'uk_user_openid'))) {
    await pool.query('ALTER TABLE users ADD UNIQUE KEY uk_user_openid (wechat_openid)');
    created.push('users.uk_user_openid');
  }

  // 历史报告视为已复核，避免升级后把旧数据全部塞进待复核队列
  if (addedReview) {
    const [r] = await pool.query(
      `UPDATE qc_reports SET review_status = 'confirmed', final_score = score, reviewed_at = created_at
       WHERE review_status = 'pending' AND final_score IS NULL`,
    );
    console.log(`✔ 历史质控报告已标记为已复核：${r.affectedRows} 条`);
  }

  // 审计链：缺哈希或链头为空时重建
  if (await hasTable('audit_logs')) {
    const [[missing]] = await pool.query("SELECT COUNT(*) AS c FROM audit_logs WHERE hash IS NULL OR hash = ''");
    const [[total]] = await pool.query('SELECT COUNT(*) AS c FROM audit_logs');
    const [head] = await pool.query('SELECT last_id FROM audit_chain WHERE id = 1');
    if (missing.c > 0 || (total.c > 0 && (!head[0] || Number(head[0].last_id) === 0))) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const count = await backfillAudit(conn);
        await conn.commit();
        console.log(`✔ 审计哈希链已重建：${count} 条`);
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    }
  }

  // 历史病历补一份“基线版本”，让升级后的首次复评也能对比出字段变化
  if (await hasTable('record_versions')) {
    const [rows] = await pool.query(
      `SELECT mr.id, mr.chief_complaint, mr.present_illness, mr.past_history,
              mr.physical_exam, mr.auxiliary_exam, mr.diagnosis, mr.treatment,
              q.id AS report_id, q.score, q.level,
              q.dim_completeness, q.dim_accuracy, q.dim_logic, q.dim_terminology, q.created_at
       FROM medical_records mr
       JOIN qc_reports q ON q.id = (SELECT MAX(q2.id) FROM qc_reports q2 WHERE q2.record_id = mr.id)
       WHERE NOT EXISTS (SELECT 1 FROM record_versions rv WHERE rv.record_id = mr.id)`,
    );
    let seeded = 0;
    for (const r of rows) {
      const snapshot = {
        chief_complaint: r.chief_complaint || '',
        present_illness: r.present_illness || '',
        past_history: r.past_history || '',
        physical_exam: r.physical_exam || '',
        auxiliary_exam: r.auxiliary_exam || '',
        diagnosis: r.diagnosis || '',
        treatment: r.treatment || '',
      };
      const dimensions = {
        completeness: Number(r.dim_completeness || 0),
        accuracy: Number(r.dim_accuracy || 0),
        logic: Number(r.dim_logic || 0),
        terminology: Number(r.dim_terminology || 0),
      };
      await pool.query(
        `INSERT INTO record_versions
         (record_id, version, snapshot, dimensions, score, level, report_id, source, created_at)
         VALUES (?, 1, ?, ?, ?, ?, ?, 'qc', ?)`,
        [r.id, JSON.stringify(snapshot), JSON.stringify(dimensions), r.score, r.level, r.report_id, r.created_at],
      );
      seeded += 1;
    }
    if (seeded) console.log(`✔ 已为历史病历补建基线版本：${seeded} 份`);
  }

  // 已存在的不通过病历补建整改任务（幂等）
  if (await hasTable('rectify_tasks')) {
    const [r] = await pool.query(
      `INSERT INTO rectify_tasks (record_id, report_id, doctor_id, dept_id, status, due_at)
       SELECT mr.id, q.id, mr.doctor_id, v.dept_id, 'open', DATE_ADD(NOW(), INTERVAL 3 DAY)
       FROM medical_records mr
       JOIN visits v ON v.id = mr.visit_id
       JOIN qc_reports q ON q.id = (SELECT MAX(q2.id) FROM qc_reports q2 WHERE q2.record_id = mr.id)
       WHERE mr.status = 'qc_failed'
         AND NOT EXISTS (
           SELECT 1 FROM rectify_tasks t WHERE t.record_id = mr.id AND t.status IN ('open','submitted')
         )`,
    );
    if (r.affectedRows) console.log(`✔ 已为 ${r.affectedRows} 份不通过病历补建整改任务`);
  }

  let ruleCount = 0;
  for (const rule of NEW_RULES) {
    const [rows] = await pool.query('SELECT id FROM qc_rules WHERE code = ?', [rule[0]]);
    if (!rows.length) {
      await pool.query(
        'INSERT INTO qc_rules (code, name, category, severity, weight, description) VALUES (?, ?, ?, ?, ?, ?)',
        rule,
      );
      ruleCount += 1;
    }
  }

  // 上次进程被强杀时，任务可能停在 running，启动迁移时顺手收尾，避免永远转圈
  if (await hasTable('qc_batches')) {
    const [stale] = await pool.query("SELECT id FROM qc_batches WHERE status IN ('queued','running')");
    if (stale.length) {
      await pool.query(
        "UPDATE qc_batches SET status = 'failed', finished_at = NOW() WHERE status IN ('queued','running')",
      );
      await pool.query(
        "UPDATE qc_batch_items SET status = 'failed', error = '服务重启，任务中断' WHERE status IN ('pending','running')",
      );
      console.log(`⚠ 已标记 ${stale.length} 个中断的批量质控任务为 failed`);
    }
  }

  console.log(created.length ? `✔ 迁移完成：${created.join('、')}` : '✔ 数据库已是最新结构，无需迁移');
  console.log(ruleCount ? `✔ 新增质控规则 ${ruleCount} 条` : '✔ 质控规则已齐全');
  await pool.end();
}

main().catch(async (err) => {
  console.error('✖ 迁移失败：', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
