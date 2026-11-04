<template>
  <view class="page">
    <view class="head">
      <text class="title">知识库问答</text>
      <text class="sub">RAG 检索：病历书写规范 / 质控规则 / 制度政策 / 缺陷案例</text>
    </view>

    <view class="card stats">
      <view class="stat"><text class="num">{{ stats.documents }}</text><text class="label">篇文档</text></view>
      <view class="stat"><text class="num">{{ stats.chunks }}</text><text class="label">个分块</text></view>
      <view class="stat"><text class="num">{{ stats.questions }}</text><text class="label">次提问</text></view>
    </view>

    <view class="card">
      <textarea v-model="question" class="ask-input" placeholder="例如：现病史应该怎么写才规范？质控评分怎么算？" maxlength="1000" />
      <view class="suggest">
        <text v-for="q in suggestions" :key="q" class="sug" @click="askQuestion(q)">{{ q }}</text>
      </view>
      <button class="btn-primary ask-btn" :loading="loading" @click="ask">检索并回答</button>
    </view>

    <view v-if="result" class="card">
      <view class="row answer-head">
        <text class="tag tag-green">{{ modelLabel }}</text>
        <view class="spacer" />
        <text class="muted">{{ result.latencyMs }} ms · 引用 {{ (result.sources || []).length }} 段</text>
      </view>
      <text class="answer">{{ clean(result.answer) }}</text>

      <view v-if="(result.sources || []).length" class="sources">
        <text class="section-title">引用来源</text>
        <view v-for="s in result.sources" :key="s.index" class="source">
          <view class="row">
            <text class="src-idx">{{ s.index }}</text>
            <text class="src-title">{{ s.title }}</text>
            <text class="tag tag-gray">相关度 {{ s.score }}</text>
          </view>
          <text class="src-snippet">{{ s.snippet }}…</text>
        </view>
      </view>
    </view>

    <view v-if="docs.length" class="card">
      <text class="section-title">知识库文档（{{ docs.length }}）</text>
      <view v-for="d in docs.slice(0, 8)" :key="d.id" class="doc">
        <text class="doc-title">{{ d.title }}</text>
        <text class="muted">{{ categoryText(d.category) }} · {{ d.chunk_count }} 段 · {{ d.chars }} 字</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { api } from '@/api';

const stats = ref({ documents: 0, chunks: 0, questions: 0 });
const docs = ref<any[]>([]);
const question = ref('');
const loading = ref(false);
const result = ref<any>(null);

const suggestions = ['现病史应该怎么写？', '质控评分怎么算？', '死亡病例讨论的要求', '诊断名称怎么规范书写'];
const clean = (s: string) => String(s || '')
  .replace(/^#{1,6}\s*/gm, '')
  .replace(/\*\*(.*?)\*\*/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/^\s*[-*]\s+/gm, '• ');
const categoryText = (c: string) => ({ guideline: '书写规范', qc_rule: '质控规则', policy: '制度政策', case: '缺陷案例' } as Record<string, string>)[c] || c;
const modelLabel = computed(() => {
  const m = result.value?.model || '';
  if (m.includes('extractive')) return '抽取式回答';
  if (m.includes('deepseek')) return 'DeepSeek 归纳';
  return m || '检索结果';
});

async function load() {
  try {
    const [d, s] = await Promise.all([api.kbDocuments(), api.kbStats()]);
    docs.value = d;
    stats.value = s;
  } catch {
    // 知识库为空/未初始化时仍可提问
  }
}

async function ask() {
  const q = question.value.trim();
  if (q.length < 2) {
    uni.showToast({ title: '请输入问题', icon: 'none' });
    return;
  }
  loading.value = true;
  try {
    result.value = await api.kbAsk(q, 5);
    stats.value.questions += 1;
  } catch (e: any) {
    uni.showModal({ title: '检索失败', content: e.message || '未知错误', showCancel: false });
  } finally {
    loading.value = false;
  }
}

function askQuestion(q: string) {
  question.value = q;
  ask();
}

onShow(load);
</script>

<style scoped>
.head { padding: 8rpx 4rpx 16rpx; }
.title { display: block; font-size: 38rpx; font-weight: 800; }
.sub { display: block; margin-top: 4rpx; color: #64748b; font-size: 20rpx; line-height: 1.5; }
.stats { display: flex; padding: 20rpx; }
.stat { flex: 1; text-align: center; }
.num { display: block; font-size: 36rpx; font-weight: 800; color: #0b5c56; }
.label { display: block; margin-top: 2rpx; color: #94a3b8; font-size: 19rpx; }
.ask-input { width: 100%; min-height: 150rpx; background: #f4f7fa; border-radius: 12rpx; padding: 16rpx; font-size: 24rpx; line-height: 1.65; }
.suggest { display: flex; flex-wrap: wrap; margin-top: 12rpx; }
.sug { padding: 8rpx 14rpx; margin: 0 8rpx 8rpx 0; border: 1rpx solid #e2e8f0; border-radius: 999rpx; font-size: 20rpx; color: #334155; }
.ask-btn { margin-top: 10rpx; height: 80rpx; line-height: 80rpx; font-size: 26rpx; }
.answer-head { margin-bottom: 12rpx; }
.muted { color: #94a3b8; font-size: 20rpx; }
.answer { display: block; font-size: 23rpx; line-height: 1.8; color: #1e293b; white-space: pre-wrap; }
.sources { margin-top: 18rpx; padding-top: 14rpx; border-top: 1rpx solid #eef2f5; }
.section-title { display: block; font-size: 24rpx; font-weight: 700; margin-bottom: 10rpx; }
.source { padding: 12rpx; background: #fbfdfe; border-radius: 10rpx; margin-bottom: 10rpx; }
.src-idx { width: 30rpx; height: 30rpx; line-height: 30rpx; text-align: center; background: #e9f7f5; color: #0b5c56; border-radius: 6rpx; font-size: 18rpx; margin-right: 8rpx; }
.src-title { flex: 1; font-size: 22rpx; font-weight: 600; }
.src-snippet { display: block; margin-top: 6rpx; color: #64748b; font-size: 20rpx; line-height: 1.6; }
.doc { padding: 12rpx 0; border-top: 1rpx solid #eef2f5; }
.doc:first-of-type { border-top: none; }
.doc-title { display: block; font-size: 23rpx; font-weight: 600; }
.doc .muted { display: block; margin-top: 2rpx; }
</style>
