/**
 * 合成配音轨并压制最终 mp4
 * 输入：demo-video-narrated/medai-narrated.webm + timeline.json + .tmp/narr/narr/*.mp3
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const FF = require('@ffmpeg-installer/ffmpeg').path;
const ROOT = __dirname;
const OUT = path.join(ROOT, 'demo-video-narrated');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, '.tmp/narr/narr/durations.json'), 'utf8'));
const timeline = JSON.parse(fs.readFileSync(path.join(OUT, 'timeline.json'), 'utf8'));

const byId = Object.fromEntries(META.map((m) => [m.id, m]));
const inputs = [];
const filters = [];
const labels = [];

timeline.forEach((t, i) => {
  const m = byId[t.id];
  inputs.push('-i', m.file);
  const ms = Math.round(t.offset * 1000);
  // 单声道 → 双声道，并延迟到对应时间点
  filters.push(`[${i}:a]aresample=44100,pan=stereo|c0=c0|c1=c0,adelay=${ms}|${ms},volume=1.3[a${i}]`);
  labels.push(`[a${i}]`);
});

// amix 会按输入路数衰减音量，混音后再乘回去；最后加限幅器防爆音
const mix = `${labels.join('')}amix=inputs=${labels.length}:duration=longest,volume=${labels.length},alimiter=limit=0.95[out]`;
const wav = path.join(OUT, 'narration.wav');

const r1 = spawnSync(FF, [
  '-y', '-hide_banner', '-loglevel', 'error',
  ...inputs,
  '-filter_complex', `${filters.join(';')};${mix}`,
  '-map', '[out]', '-ar', '44100', '-ac', '2', wav,
], { encoding: 'utf8' });
if (r1.status !== 0) {
  console.error(r1.stderr);
  process.exit(1);
}
console.log('音频轨完成:', wav);

const finalMp4 = path.join(OUT, '智医质控-MedAI-讲解版.mp4');
const r2 = spawnSync(FF, [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-i', path.join(OUT, 'medai-narrated.webm'),
  '-i', wav,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '128k',
  '-shortest', '-movflags', '+faststart',
  finalMp4,
], { encoding: 'utf8' });
if (r2.status !== 0) {
  console.error(r2.stderr);
  process.exit(1);
}
console.log('成片:', finalMp4, (fs.statSync(finalMp4).size / 1024 / 1024).toFixed(1) + 'MB');
