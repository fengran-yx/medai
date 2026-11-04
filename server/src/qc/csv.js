/**
 * 轻量 CSV 生成（无第三方依赖）。
 * Excel 打开中文 CSV 需要 UTF-8 BOM；字段里的逗号/引号/换行按 RFC 4180 转义。
 */
export function escapeCsv(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers, rows) {
  const lines = [headers.map(escapeCsv).join(',')];
  for (const row of rows) lines.push(row.map(escapeCsv).join(','));
  return `\uFEFF${lines.join('\r\n')}`;
}
