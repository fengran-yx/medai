-- ============================================================
-- 智医质控 MedAI · 数据库总览（在 MySQL Workbench 中打开本文件）
-- 连接信息：host 127.0.0.1 · port 3306 · user root · password <你的 MySQL 密码> · schema medai
-- 用法：先连上数据库，再逐段选中执行（Ctrl+Enter 执行当前语句）
-- ============================================================

USE medai;

-- ---------- 1. 表清单 ----------
SHOW TABLES;

-- ---------- 2. 表结构（逐张看） ----------
DESCRIBE departments;
DESCRIBE users;
DESCRIBE patients;
DESCRIBE visits;
DESCRIBE medical_records;
DESCRIBE qc_reports;
DESCRIBE qc_rules;
DESCRIBE diagnosis_sessions;
DESCRIBE ai_chats;
DESCRIBE ai_messages;
DESCRIBE audit_logs;

-- ---------- 3. 数据概览 ----------
SELECT '科室' AS 表, COUNT(*) AS 行数 FROM departments
UNION ALL SELECT '用户', COUNT(*) FROM users
UNION ALL SELECT '患者', COUNT(*) FROM patients
UNION ALL SELECT '就诊', COUNT(*) FROM visits
UNION ALL SELECT '病历', COUNT(*) FROM medical_records
UNION ALL SELECT '质控报告', COUNT(*) FROM qc_reports
UNION ALL SELECT '质控规则', COUNT(*) FROM qc_rules
UNION ALL SELECT '辅助诊断', COUNT(*) FROM diagnosis_sessions
UNION ALL SELECT 'AI 会话', COUNT(*) FROM ai_chats
UNION ALL SELECT '审计日志', COUNT(*) FROM audit_logs;

-- ---------- 4. 用户与角色 ----------
SELECT u.id, u.username, u.name, u.role, u.title, d.name AS dept, u.status, u.last_login_at
FROM users u LEFT JOIN departments d ON d.id = u.dept_id
ORDER BY u.id;

-- ---------- 5. 病历 + 最近一次质控分 ----------
SELECT mr.id, p.name AS 患者, p.mrn, d.name AS 科室, mr.diagnosis AS 诊断,
       mr.status AS 状态, q.score AS 质控分, q.level AS 等级, mr.updated_at
FROM medical_records mr
JOIN patients p ON p.id = mr.patient_id
JOIN visits v ON v.id = mr.visit_id
LEFT JOIN departments d ON d.id = v.dept_id
LEFT JOIN qc_reports q ON q.id = (SELECT MAX(id) FROM qc_reports WHERE record_id = mr.id)
ORDER BY mr.id DESC
LIMIT 20;

-- ---------- 6. 质控报告（JSON 字段长什么样） ----------
SELECT id, record_id, score, level, risk, model,
       dim_completeness, dim_accuracy, dim_logic, dim_terminology,
       JSON_PRETTY(issues) AS issues_json,
       created_at
FROM qc_reports
ORDER BY id DESC
LIMIT 3;

-- ---------- 7. 按维度统计问题数量（JSON 拆解） ----------
SELECT jt.rule AS 问题, COUNT(*) AS 次数
FROM qc_reports q,
     JSON_TABLE(q.issues, '$[*]' COLUMNS (rule VARCHAR(100) PATH '$.rule')) AS jt
GROUP BY jt.rule
ORDER BY 次数 DESC;

-- ---------- 8. 科室平均质控分 ----------
SELECT d.name AS 科室, COUNT(q.id) AS 质控次数, ROUND(AVG(q.score), 1) AS 平均分,
       SUM(q.score >= 80) AS 通过数
FROM departments d
JOIN visits v ON v.dept_id = d.id
JOIN medical_records mr ON mr.visit_id = v.id
JOIN qc_reports q ON q.record_id = mr.id
GROUP BY d.id, d.name
HAVING 质控次数 > 0
ORDER BY 平均分 DESC;

-- ---------- 9. 最近审计日志 ----------
SELECT id, user_name, action, target_type, target_id, detail, ip, created_at
FROM audit_logs
ORDER BY id DESC
LIMIT 20;

-- ---------- 10. 索引与外键 ----------
SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, NON_UNIQUE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'medai'
ORDER BY TABLE_NAME, INDEX_NAME;

SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'medai' AND REFERENCED_TABLE_NAME IS NOT NULL;
