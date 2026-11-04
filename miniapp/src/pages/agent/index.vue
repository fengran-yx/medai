<template>
  <view class="page">
    <view class="head">
      <text class="title">AI 质控助手</text>
      <text class="sub">自动规划步骤、调用工具（查病历 / 跑质控 / 出统计）</text>
    </view>

    <view class="card">
      <textarea v-model="goal" class="goal" placeholder="例如：统计最近 7 天质控情况，列出高频问题" maxlength="1000" />
      <view class="presets">
        <text v-for="p in presets" :key="p" class="preset" @click="goal = p">{{ p }}</text>
      </view>
      <button class="btn-primary run-btn" :loading="running" @click="run">执行</button>
      <text v-if="result" class="meta">{{ result.model }} · {{ (result.steps || []).length }} 步 · {{ result.durationMs || result.duration_ms || '-' }} ms</text>
    </view>

    <view v-if="result" class="card">
      <text class="section-title">执行步骤</text>
      <view v-for="s in result.steps || []" :key="s.step" class="step">
        <view class="row">
          <text class="step-idx">{{ s.step }}</text>
          <text class="tool">{{ s.tool }}</text>
          <text class="muted">{{ s.ms }} ms</text>
        </view>
        <text v-if="fmtArgs(s.args)" class="args">{{ fmtArgs(s.args) }}</text>
        <text class="step-result">{{ fmtResult(s.result) }}</text>
      </view>

      <view class="answer">
        <text class="answer-label">最终答复</text>
        <text class="answer-text">{{ clean(result.answer) }}</text>
      </view>
    </view>

    <view v-if="history.length" class="card">
      <text class="section-title">最近运行</text>
      <view v-for="h in history" :key="h.id" class="history" @click="replay(h.id)">
        <text class="h-goal">{{ h.goal }}</text>
        <text class="muted">{{ h.model }} · {{ h.step_count }} 步 · {{ h.duration_ms }}ms</text>
      </view>
    </view>

    <view v-if="tools.length" class="card">
      <text class="section-title">可用工具</text>
      <view v-for="t in tools" :key="t.name" class="tool-item">
        <text class="tool-name">{{ t.name }}</text>
        <text class="tool-desc">{{ t.description }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { api } from '@/api';

const goal = ref('');
const running = ref(false);
const result = ref<any>(null);
const tools = ref<any[]>([]);
const history = ref<any[]>([]);

const presets = [
  '统计最近 7 天的质控情况，列出高频问题',
  '把最近质控不通过的病历重新质控，并给出周报',
  '查一下内科的病历质控情况',
];

const clean = (s: string) => String(s || '')
  .replace(/^#{1,6}\s*/gm, '')
  .replace(/\*\*(.*?)\*\*/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/^\s*[-*]\s+/gm, '• ');

const fmtArgs = (a: any) => {
  const s = JSON.stringify(a || {});
  return s === '{}' ? '' : s;
};
const fmtResult = (r: any) => {
  if (!r) return '';
  if (r.error) return `错误：${r.error}`;
  if (r.count !== undefined) return `${r.count} 条病历：${(r.records || []).slice(0, 3).map((x: any) => x.patient).join('、')}`;
  if (r.score !== undefined) return `${r.score} 分（${r.level} 级）· ${(r.issues || []).map((i: any) => i.rule).join('、')}`;
  if (r.total !== undefined) return `近 ${r.days} 天 ${r.total} 份 · 均分 ${r.avgScore} · 通过率 ${r.passRate}%`;
  return JSON.stringify(r).slice(0, 100);
};

async function load() {
  try {
    const [t, h] = await Promise.all([api.agentTools(), api.agentRuns(6)]);
    tools.value = t;
    history.value = h;
  } catch {
    // 忽略
  }
}

async function run() {
  const g = goal.value.trim();
  if (g.length < 4) {
    uni.showToast({ title: '请描述你要做什么', icon: 'none' });
    return;
  }
  running.value = true;
  try {
    result.value = await api.agentRun(g);
    history.value = await api.agentRuns(6).catch(() => history.value);
  } catch (e: any) {
    uni.showModal({ title: '执行失败', content: e.message || '未知错误', showCancel: false });
  } finally {
    running.value = false;
  }
}

async function replay(id: number) {
  try {
    const d = await api.agentRunDetail(id);
    result.value = { ...d, steps: d.steps || [], durationMs: d.duration_ms, model: d.model };
  } catch (e: any) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  }
}

onShow(load);
</script>

<style scoped>
.head { padding: 8rpx 4rpx 16rpx; }
.title { display: block; font-size: 38rpx; font-weight: 800; }
.sub { display: block; margin-top: 4rpx; color: #64748b; font-size: 20rpx; }
.goal { width: 100%; min-height: 150rpx; background: #f4f7fa; border-radius: 12rpx; padding: 16rpx; font-size: 24rpx; line-height: 1.65; }
.presets { display: flex; flex-wrap: wrap; margin-top: 10rpx; }
.preset { padding: 8rpx 14rpx; margin: 0 8rpx 8rpx 0; border: 1rpx solid #e2e8f0; border-radius: 999rpx; font-size: 20rpx; color: #334155; }
.run-btn { margin-top: 10rpx; height: 80rpx; line-height: 80rpx; font-size: 26rpx; }
.meta { display: block; margin-top: 10rpx; color: #94a3b8; font-size: 20rpx; }
.section-title { display: block; font-size: 25rpx; font-weight: 700; margin-bottom: 10rpx; }
.step { padding: 12rpx; background: #fbfdfe; border-radius: 10rpx; margin-bottom: 10rpx; }
.step-idx { width: 30rpx; height: 30rpx; line-height: 30rpx; text-align: center; background: #e9f7f5; color: #0b5c56; border-radius: 6rpx; font-size: 18rpx; margin-right: 8rpx; }
.tool { font-size: 21rpx; background: #eef4f8; color: #33596b; padding: 2rpx 8rpx; border-radius: 5rpx; margin-right: 8rpx; }
.muted { color: #94a3b8; font-size: 19rpx; }
.args { display: block; margin-top: 4rpx; color: #64748b; font-size: 19rpx; }
.step-result { display: block; margin-top: 4rpx; color: #1e293b; font-size: 21rpx; line-height: 1.6; }
.answer { margin-top: 14rpx; padding: 16rpx; background: #e9f7f5; border-radius: 12rpx; }
.answer-label { display: block; color: #0b5c56; font-size: 21rpx; font-weight: 700; }
.answer-text { display: block; margin-top: 6rpx; color: #1e293b; font-size: 22rpx; line-height: 1.75; white-space: pre-wrap; }
.history { padding: 12rpx 0; border-top: 1rpx solid #eef2f5; }
.history:first-of-type { border-top: none; }
.h-goal { display: block; font-size: 22rpx; color: #1e293b; line-height: 1.5; }
.history .muted { display: block; margin-top: 2rpx; }
.tool-item { padding: 10rpx 0; border-top: 1rpx solid #eef2f5; }
.tool-item:first-of-type { border-top: none; }
.tool-name { font-size: 21rpx; color: #33596b; background: #eef4f8; padding: 2rpx 8rpx; border-radius: 5rpx; }
.tool-desc { display: block; margin-top: 4rpx; color: #64748b; font-size: 20rpx; line-height: 1.5; }
</style>
