-- ============================================================
-- 智医质控 MedAI · 数据库结构（MySQL 8.0）
-- 说明：全部使用 utf8mb4；时间统一 DATETIME；
--       JSON 字段用于存放 AI 结构化结果，便于前端直接消费。
-- ============================================================

CREATE DATABASE IF NOT EXISTS medai
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

USE medai;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS qc_batch_items;
DROP TABLE IF EXISTS qc_batches;
DROP TABLE IF EXISTS rectify_tasks;
DROP TABLE IF EXISTS record_versions;
DROP TABLE IF EXISTS audit_chain;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS ai_messages;
DROP TABLE IF EXISTS ai_chats;
DROP TABLE IF EXISTS diagnosis_sessions;
DROP TABLE IF EXISTS qc_reports;
DROP TABLE IF EXISTS qc_rules;
DROP TABLE IF EXISTS medical_records;
DROP TABLE IF EXISTS visits;
DROP TABLE IF EXISTS patients;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS departments;

SET FOREIGN_KEY_CHECKS = 1;

-- 科室
CREATE TABLE departments (
  id          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '科室ID',
  code        VARCHAR(20)  NOT NULL COMMENT '科室编码',
  name        VARCHAR(50)  NOT NULL COMMENT '科室名称',
  dept_type   VARCHAR(20)  NOT NULL DEFAULT 'clinical' COMMENT '类型 clinical/medical_tech/management',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_dept_code (code)
) ENGINE=InnoDB COMMENT='科室字典';

-- 用户（医生 / 质控 / 管理员）
CREATE TABLE users (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50)  NOT NULL COMMENT '登录名',
  password      VARCHAR(100) NOT NULL COMMENT 'bcrypt 密文',
  name          VARCHAR(50)  NOT NULL COMMENT '姓名',
  role          VARCHAR(20)  NOT NULL DEFAULT 'clinician' COMMENT 'admin/quality/clinician',
  title         VARCHAR(30)  DEFAULT NULL COMMENT '职称',
  dept_id       BIGINT       DEFAULT NULL,
  phone         VARCHAR(20)  DEFAULT NULL,
  status        TINYINT      NOT NULL DEFAULT 1 COMMENT '1启用 0停用',
  failed_attempts TINYINT    NOT NULL DEFAULT 0 COMMENT '连续登录失败次数',
  locked_until  DATETIME     DEFAULT NULL COMMENT '锁定截止时间',
  token_version INT          NOT NULL DEFAULT 0 COMMENT '会话版本，改密/强制下线时 +1',
  last_login_at DATETIME     DEFAULT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_name (username),
  KEY idx_user_dept (dept_id),
  CONSTRAINT fk_user_dept FOREIGN KEY (dept_id) REFERENCES departments (id)
) ENGINE=InnoDB COMMENT='系统用户';

-- 患者
CREATE TABLE patients (
  id          BIGINT      NOT NULL AUTO_INCREMENT,
  mrn         VARCHAR(30) NOT NULL COMMENT '病案号',
  name        VARCHAR(50) NOT NULL,
  gender      VARCHAR(4)  NOT NULL DEFAULT '男',
  birth_date  DATE        DEFAULT NULL,
  id_card     VARCHAR(30) DEFAULT NULL,
  phone       VARCHAR(20) DEFAULT NULL,
  blood_type  VARCHAR(6)  DEFAULT NULL,
  allergy     VARCHAR(200) DEFAULT NULL COMMENT '过敏史',
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_patient_mrn (mrn),
  KEY idx_patient_name (name)
) ENGINE=InnoDB COMMENT='患者主索引';

-- 就诊记录
CREATE TABLE visits (
  id             BIGINT      NOT NULL AUTO_INCREMENT,
  visit_no       VARCHAR(30) NOT NULL COMMENT '就诊流水号',
  patient_id     BIGINT      NOT NULL,
  dept_id        BIGINT      NOT NULL,
  doctor_id      BIGINT      DEFAULT NULL,
  visit_type     VARCHAR(20) NOT NULL DEFAULT 'outpatient' COMMENT 'outpatient/emergency/inpatient',
  chief_complaint VARCHAR(500) DEFAULT NULL COMMENT '主诉',
  diagnosis      VARCHAR(500) DEFAULT NULL COMMENT '初步诊断',
  visit_time     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status         VARCHAR(20) NOT NULL DEFAULT 'open' COMMENT 'open/closed',
  PRIMARY KEY (id),
  UNIQUE KEY uk_visit_no (visit_no),
  KEY idx_visit_patient (patient_id),
  KEY idx_visit_time (visit_time),
  KEY idx_visit_dept (dept_id),
  CONSTRAINT fk_visit_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
  CONSTRAINT fk_visit_dept FOREIGN KEY (dept_id) REFERENCES departments (id),
  CONSTRAINT fk_visit_doctor FOREIGN KEY (doctor_id) REFERENCES users (id)
) ENGINE=InnoDB COMMENT='就诊记录';

-- 病历（结构化字段，用于 AI 质控评分）
CREATE TABLE medical_records (
  id               BIGINT      NOT NULL AUTO_INCREMENT,
  visit_id         BIGINT      NOT NULL,
  patient_id       BIGINT      NOT NULL,
  doctor_id        BIGINT      DEFAULT NULL,
  chief_complaint  TEXT        COMMENT '主诉',
  present_illness  TEXT        COMMENT '现病史',
  past_history     TEXT        COMMENT '既往史',
  physical_exam    TEXT        COMMENT '体格检查',
  auxiliary_exam   TEXT        COMMENT '辅助检查',
  diagnosis        TEXT        COMMENT '诊断',
  treatment        TEXT        COMMENT '处理意见',
  status           VARCHAR(20) NOT NULL DEFAULT 'draft' COMMENT 'draft/submitted/qc_passed/qc_failed',
  submitted_at     DATETIME    DEFAULT NULL,
  created_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_record_visit (visit_id),
  KEY idx_record_patient (patient_id),
  KEY idx_record_status (status),
  CONSTRAINT fk_record_visit FOREIGN KEY (visit_id) REFERENCES visits (id),
  CONSTRAINT fk_record_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
  CONSTRAINT fk_record_doctor FOREIGN KEY (doctor_id) REFERENCES users (id)
) ENGINE=InnoDB COMMENT='电子病历';

-- 病历质控版本快照（每次运行质控时留档，支持整改前后对比）
CREATE TABLE record_versions (
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
) ENGINE=InnoDB COMMENT='病历质控版本快照';

-- 质控规则（规则引擎 + AI 提示词共同使用）
CREATE TABLE qc_rules (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  code        VARCHAR(30)  NOT NULL COMMENT '规则编码',
  name        VARCHAR(100) NOT NULL,
  category    VARCHAR(20)  NOT NULL COMMENT 'completeness/accuracy/logic/terminology/timeliness',
  severity    VARCHAR(10)  NOT NULL DEFAULT 'major' COMMENT 'critical/major/minor',
  weight      INT          NOT NULL DEFAULT 10 COMMENT '扣分权重',
  description VARCHAR(500) DEFAULT NULL,
  enabled     TINYINT      NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uk_rule_code (code)
) ENGINE=InnoDB COMMENT='病历质控规则';

-- 质控报告（AI 结果落库）
CREATE TABLE qc_reports (
  id          BIGINT      NOT NULL AUTO_INCREMENT,
  record_id   BIGINT      NOT NULL,
  score       DECIMAL(5,1) NOT NULL DEFAULT 0 COMMENT '总分 0-100',
  level       VARCHAR(10) NOT NULL DEFAULT 'C' COMMENT 'A/B/C/D',
  dim_completeness DECIMAL(5,1) NOT NULL DEFAULT 0,
  dim_accuracy     DECIMAL(5,1) NOT NULL DEFAULT 0,
  dim_logic        DECIMAL(5,1) NOT NULL DEFAULT 0,
  dim_terminology  DECIMAL(5,1) NOT NULL DEFAULT 0,
  risk        TINYINT     NOT NULL DEFAULT 0 COMMENT '0-3 风险等级',
  issues      JSON        COMMENT '问题清单 [{rule,severity,field,message,suggestion}]',
  suggestions JSON        COMMENT '改进建议 [string]',
  summary     TEXT        COMMENT 'AI 总评',
  model       VARCHAR(50) DEFAULT NULL,
  duration_ms INT         DEFAULT NULL,
  prev_score  DECIMAL(5,1) DEFAULT NULL COMMENT '上一次质控得分，便于计算整改提升',
  score_delta DECIMAL(5,1) DEFAULT NULL COMMENT '本次得分 - 上一次得分',
  record_version INT      DEFAULT NULL COMMENT '对应的病历版本号',
  review_status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending/confirmed/overridden',
  reviewer_id   BIGINT      DEFAULT NULL,
  reviewer_name VARCHAR(50) DEFAULT NULL,
  reviewed_at   DATETIME    DEFAULT NULL,
  final_score   DECIMAL(5,1) DEFAULT NULL COMMENT '人工复核后的最终分',
  review_note   VARCHAR(500) DEFAULT NULL,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_qc_record (record_id),
  KEY idx_qc_created (created_at),
  KEY idx_qc_review (review_status, id),
  CONSTRAINT fk_qc_record FOREIGN KEY (record_id) REFERENCES medical_records (id)
) ENGINE=InnoDB COMMENT='病历质控报告';

-- 整改任务（AI 质控不通过时自动生成，面向临床医师督办）
CREATE TABLE rectify_tasks (
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
) ENGINE=InnoDB COMMENT='病历整改任务';

-- 批量质控任务（异步执行，前端轮询进度）
CREATE TABLE qc_batches (
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
) ENGINE=InnoDB COMMENT='批量质控任务';

CREATE TABLE qc_batch_items (
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
) ENGINE=InnoDB COMMENT='批量质控明细';

-- AI 辅助诊断会话
CREATE TABLE diagnosis_sessions (
  id             BIGINT   NOT NULL AUTO_INCREMENT,
  visit_id       BIGINT   DEFAULT NULL,
  patient_id     BIGINT   DEFAULT NULL,
  doctor_id      BIGINT   DEFAULT NULL,
  symptoms       TEXT     COMMENT '症状输入',
  exams          TEXT     COMMENT '检查检验输入',
  result         JSON     COMMENT 'AI 诊断建议',
  risk           TINYINT  NOT NULL DEFAULT 0,
  model          VARCHAR(50) DEFAULT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_diag_doctor (doctor_id),
  KEY idx_diag_created (created_at)
) ENGINE=InnoDB COMMENT='AI 辅助诊断记录';

-- AI 问答会话
CREATE TABLE ai_chats (
  id         BIGINT      NOT NULL AUTO_INCREMENT,
  user_id    BIGINT      NOT NULL,
  title      VARCHAR(120) NOT NULL DEFAULT '新会话',
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_chat_user (user_id)
) ENGINE=InnoDB COMMENT='AI 会话';

CREATE TABLE ai_messages (
  id         BIGINT      NOT NULL AUTO_INCREMENT,
  chat_id    BIGINT      NOT NULL,
  role       VARCHAR(10) NOT NULL COMMENT 'user/assistant',
  content    MEDIUMTEXT  NOT NULL,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_msg_chat (chat_id, id),
  CONSTRAINT fk_msg_chat FOREIGN KEY (chat_id) REFERENCES ai_chats (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='AI 消息';

-- 审计日志（prev_hash/hash 组成防篡改哈希链）
CREATE TABLE audit_logs (
  id          BIGINT      NOT NULL AUTO_INCREMENT,
  user_id     BIGINT      DEFAULT NULL,
  user_name   VARCHAR(50) DEFAULT NULL,
  action      VARCHAR(50) NOT NULL COMMENT 'login/record.qc/patient.create ...',
  target_type VARCHAR(30) DEFAULT NULL,
  target_id   BIGINT      DEFAULT NULL,
  detail      VARCHAR(500) DEFAULT NULL,
  ip          VARCHAR(45) DEFAULT NULL,
  prev_hash   CHAR(64)    DEFAULT NULL COMMENT '上一条日志的哈希',
  hash        CHAR(64)    DEFAULT NULL COMMENT '本条日志哈希',
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_log_created (created_at),
  KEY idx_log_user (user_id)
) ENGINE=InnoDB COMMENT='操作审计日志';

-- 审计链头（单行，事务内 FOR UPDATE 串行化写入）
CREATE TABLE audit_chain (
  id        TINYINT     NOT NULL DEFAULT 1,
  last_id   BIGINT      NOT NULL DEFAULT 0,
  last_hash CHAR(64)    NOT NULL DEFAULT '',
  updated_at DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB COMMENT='审计哈希链头';

-- ============================================================
-- RAG 知识库（检索增强生成）
-- 设计：文档 → 切块 → 稀疏向量（词项权重 JSON）→ BM25 检索
-- 不依赖外部 embedding 服务，离线可用；配了 Key 时由大模型做归纳
-- ============================================================

DROP TABLE IF EXISTS kb_chunks;
DROP TABLE IF EXISTS kb_documents;

CREATE TABLE kb_documents (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  title       VARCHAR(200) NOT NULL COMMENT '文档标题',
  category    VARCHAR(50)  NOT NULL DEFAULT 'guideline' COMMENT 'guideline/qc_rule/policy/case',
  source      VARCHAR(300) DEFAULT NULL COMMENT '来源说明',
  content     MEDIUMTEXT   NOT NULL COMMENT '原文',
  chunk_count INT          NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_kb_doc_category (category)
) ENGINE=InnoDB COMMENT='知识库文档';

CREATE TABLE kb_chunks (
  id         BIGINT    NOT NULL AUTO_INCREMENT,
  doc_id     BIGINT    NOT NULL,
  seq        INT       NOT NULL DEFAULT 0 COMMENT '段序号',
  content    TEXT      NOT NULL COMMENT '段落原文',
  token_cnt  INT       NOT NULL DEFAULT 0,
  embedding  JSON      DEFAULT NULL COMMENT '稀疏向量 {词项: 权重}',
  created_at DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_kb_chunk_doc (doc_id),
  CONSTRAINT fk_kb_chunk_doc FOREIGN KEY (doc_id) REFERENCES kb_documents (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='知识库分块与向量';

-- 问答记录（便于统计与评测）
DROP TABLE IF EXISTS kb_qa_logs;

CREATE TABLE kb_qa_logs (
  id         BIGINT   NOT NULL AUTO_INCREMENT,
  user_id    BIGINT   DEFAULT NULL,
  question   VARCHAR(500) NOT NULL,
  answer     TEXT     DEFAULT NULL,
  sources    JSON     DEFAULT NULL COMMENT '引用片段 [{docId,title,score}]',
  model      VARCHAR(50) DEFAULT NULL,
  latency_ms INT      DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_kb_qa_created (created_at)
) ENGINE=InnoDB COMMENT='知识库问答记录';

-- ============================================================
-- Agent 运行记录（工具调用链路留痕，便于回放与排错）
-- ============================================================

DROP TABLE IF EXISTS agent_runs;

CREATE TABLE agent_runs (
  id          BIGINT   NOT NULL AUTO_INCREMENT,
  user_id     BIGINT   DEFAULT NULL,
  goal        VARCHAR(500) NOT NULL COMMENT '用户目标',
  steps       JSON     DEFAULT NULL COMMENT '工具调用序列 [{step,tool,args,result,ms}]',
  answer      TEXT     DEFAULT NULL COMMENT '最终答复',
  model       VARCHAR(50) DEFAULT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'ok' COMMENT 'ok/fallback/failed',
  duration_ms INT      DEFAULT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_agent_created (created_at)
) ENGINE=InnoDB COMMENT='Agent 运行记录';
