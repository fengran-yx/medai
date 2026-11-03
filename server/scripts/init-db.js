import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import 'dotenv/config';

const sqlDir = path.resolve(process.cwd(), 'sql');

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true,
});

const schema = await fs.readFile(path.join(sqlDir, 'schema.sql'), 'utf8');
console.log('→ 正在执行 schema.sql ...');
await conn.query(schema);
console.log('✔ 数据库与表结构创建完成');

const [tableRows] = await conn.query(
  `SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = 'medai'`,
);
console.log(`  当前 medai 库共 ${tableRows[0].c} 张表`);

await conn.end();
console.log('\n下一步：执行 npm run db:seed 写入演示数据\n');
