<template>
  <view class="page">
    <view class="head">
      <text class="title">质控规则</text>
      <text class="sub">规则修改后下一次质控立即生效；停用后不再扣分</text>
    </view>

    <scroll-view scroll-x class="chips" :show-scrollbar="false">
      <view v-for="c in categories" :key="c.key" class="chip" :class="{ active: category === c.key }" @click="category = c.key">
        {{ c.label }}
      </view>
    </scroll-view>

    <view v-for="row in filtered" :key="row.id" class="card rule-card">
      <view class="row">
        <view class="grow">
          <view class="row">
            <text class="code">{{ row.code }}</text>
            <text class="name">{{ row.name }}</text>
          </view>
          <view class="row tags">
            <text class="tag tag-gray">{{ catLabel(row.category) }}</text>
            <text class="tag" :class="sevTag(row.severity)">{{ sevLabel(row.severity) }}</text>
            <text class="tag tag-gray">权重 {{ row.weight }}</text>
            <text class="tag tag-amber">近30天 {{ usage[row.code] || 0 }} 次</text>
          </view>
          <text class="desc">{{ row.description }}</text>
        </view>
        <switch :checked="row.enabled === 1" :disabled="!canEdit" color="#0f8b7f" @change="toggle(row, $event)" />
      </view>
      <view class="row foot">
        <text class="muted">{{ row.enabled === 1 ? '已启用' : '已停用' }}</text>
        <view class="spacer" />
        <text v-if="canEdit" class="edit" @click="openEdit(row)">调整权重 / 严重度</text>
      </view>
    </view>
    <view v-if="!filtered.length" class="empty">暂无规则</view>

    <view v-if="editing" class="edit-mask" @click="editing = null">
      <view class="edit-panel" @click.stop>
        <text class="panel-title">调整规则</text>
        <text class="panel-name">{{ editing.name }}</text>
        <view class="panel-field">
          <text class="panel-label">严重程度</text>
          <picker mode="selector" :range="severityLabels" :value="severityIndex" @change="onSeverity">
            <view class="picker">{{ severityLabels[severityIndex] }}<text class="arrow">›</text></view>
          </picker>
        </view>
        <view class="panel-field">
          <text class="panel-label">扣分权重（0-50）</text>
          <input v-model="weightInput" class="input" type="number" placeholder="0-50" />
        </view>
        <view class="row panel-actions">
          <button class="btn-secondary" @click="editing = null">取消</button>
          <button class="btn-primary" :loading="saving" @click="saveEdit">保存</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { api } from '@/api';
import { canQC } from '@/stores/auth';

const canEdit = canQC;
const rules = ref<any[]>([]);
const usage = ref<Record<string, number>>({});
const category = ref('');
const editing = ref<any>(null);
const weightInput = ref('');
const saving = ref(false);

const categories = [
  { key: '', label: '全部' },
  { key: 'completeness', label: '完整性' },
  { key: 'accuracy', label: '准确性' },
  { key: 'logic', label: '逻辑性' },
  { key: 'terminology', label: '规范性' },
];
const severityOptions = [
  { value: 'critical', label: '严重' },
  { value: 'major', label: '主要' },
  { value: 'minor', label: '一般' },
];
const severityLabels = severityOptions.map((s) => s.label);
const severityIndex = computed(() => Math.max(0, severityOptions.findIndex((s) => s.value === editing.value?.severity)));

const filtered = computed(() => (category.value ? rules.value.filter((r) => r.category === category.value) : rules.value));
const catLabel = (k: string) => categories.find((c) => c.key === k)?.label || k;
const sevLabel = (s: string) => severityOptions.find((x) => x.value === s)?.label || s;
const sevTag = (s: string) => ({ critical: 'tag-red', major: 'tag-amber', minor: 'tag-gray' } as Record<string, string>)[s] || 'tag-gray';

async function load() {
  try {
    const [list, hits] = await Promise.all([api.rules(), api.ruleUsage().catch(() => ({}))]);
    rules.value = list;
    usage.value = hits;
  } catch (e: any) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  }
}

async function toggle(row: any, e: any) {
  const enabled = Boolean(e.detail.value);
  try {
    await api.updateRule(row.id, { enabled });
    row.enabled = enabled ? 1 : 0;
    uni.showToast({ title: enabled ? '已启用' : '已停用', icon: 'none' });
  } catch (err: any) {
    uni.showModal({ title: '操作失败', content: err.message || '未知错误', showCancel: false });
    load();
  }
}

function openEdit(row: any) {
  editing.value = { ...row };
  weightInput.value = String(row.weight);
}
function onSeverity(e: any) {
  editing.value.severity = severityOptions[Number(e.detail.value)]?.value || 'minor';
}

async function saveEdit() {
  if (!editing.value) return;
  const weight = Number(weightInput.value);
  if (!Number.isFinite(weight) || weight < 0 || weight > 50) {
    uni.showToast({ title: '权重需在 0-50 之间', icon: 'none' });
    return;
  }
  saving.value = true;
  try {
    await api.updateRule(editing.value.id, { weight, severity: editing.value.severity });
    uni.showToast({ title: '规则已更新', icon: 'success' });
    editing.value = null;
    await load();
  } catch (e: any) {
    uni.showModal({ title: '保存失败', content: e.message || '未知错误', showCancel: false });
  } finally {
    saving.value = false;
  }
}

onShow(load);
</script>

<style scoped>
.head { padding: 8rpx 4rpx 18rpx; }
.title { display: block; font-size: 38rpx; font-weight: 800; }
.sub { display: block; margin-top: 6rpx; color: #64748b; font-size: 21rpx; line-height: 1.6; }
.chips { white-space: nowrap; margin-bottom: 16rpx; }
.chip { display: inline-block; padding: 10rpx 20rpx; margin-right: 10rpx; border-radius: 999rpx; background: #fff; color: #64748b; font-size: 22rpx; }
.chip.active { background: #0b5c56; color: #fff; font-weight: 600; }
.rule-card { padding: 22rpx; }
.grow { flex: 1; min-width: 0; }
.code { font-size: 20rpx; color: #64748b; background: #f1f5f9; padding: 2rpx 10rpx; border-radius: 6rpx; margin-right: 8rpx; }
.name { font-size: 27rpx; font-weight: 700; }
.tags { flex-wrap: wrap; margin-top: 8rpx; }
.tags .tag { margin-right: 8rpx; margin-bottom: 6rpx; }
.desc { display: block; margin-top: 6rpx; color: #64748b; font-size: 21rpx; line-height: 1.6; }
.foot { margin-top: 12rpx; padding-top: 10rpx; border-top: 1rpx solid #eef2f5; }
.edit { color: #0f8b7f; font-size: 21rpx; font-weight: 600; }
.edit-mask { position: fixed; top: 0; right: 0; bottom: 0; left: 0; background: rgba(15,23,42,.5); z-index: 50; display: flex; align-items: flex-end; }
.edit-panel { width: 100%; background: #fff; border-radius: 24rpx 24rpx 0 0; padding: 28rpx 28rpx calc(28rpx + env(safe-area-inset-bottom)); }
.panel-title { display: block; font-size: 30rpx; font-weight: 800; }
.panel-name { display: block; margin-top: 4rpx; color: #64748b; font-size: 22rpx; }
.panel-field { margin-top: 18rpx; }
.panel-label { display: block; font-size: 22rpx; color: #64748b; margin-bottom: 6rpx; }
.picker { height: 76rpx; line-height: 76rpx; background: #f4f7fa; border-radius: 12rpx; padding: 0 18rpx; font-size: 26rpx; }
.arrow { float: right; color: #94a3b8; }
.input { height: 76rpx; background: #f4f7fa; border-radius: 12rpx; padding: 0 18rpx; font-size: 26rpx; }
.panel-actions { margin-top: 22rpx; }
.panel-actions button { flex: 1; margin-right: 14rpx; height: 80rpx; line-height: 80rpx; font-size: 27rpx; }
.panel-actions button:last-child { margin-right: 0; }
.btn-secondary { background: #fff; color: #0b5c56; border: 1rpx solid #b9ded7; border-radius: 14rpx; }
.btn-secondary::after { border: none; }
</style>
