/**
 * 院内密码策略：8-64 位、必须同时包含字母和数字、不能包含登录名、不能是常见弱口令。
 * 仅用于“设置/修改密码”，不影响历史密码登录。
 */
const WEAK = new Set([
  '12345678', '123456789', 'password', 'passw0rd', 'qwerty123', 'abc12345',
  'admin123', 'doctor123', 'hospital123',
]);

export function validatePassword(password, username = '') {
  const pw = String(password ?? '');
  if (!pw) return '密码不能为空';
  if (pw.length < 8 || pw.length > 64) return '密码长度需为 8-64 位';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return '密码必须同时包含字母和数字';
  if (username && pw.toLowerCase().includes(String(username).toLowerCase())) return '密码不能包含登录名';
  if (WEAK.has(pw.toLowerCase())) return '密码过于简单，请更换';
  return null;
}
