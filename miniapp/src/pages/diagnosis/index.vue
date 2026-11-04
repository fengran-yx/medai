<template>
  <view class="page">
    <view class="head">
      <text class="title">AI 辅助诊断</text>
      <text class="sub">症状 + 检查 → 鉴别诊断、检查建议、危险信号</text>
    </view>

    <view class="card">
      <view class="row two">
        <view class="half">
          <text class="label">年龄</text>
          <input v-model="form.age" class="input" type="number" placeholder="45" />
        </view>
        <view class="half">
          <text class="label">性别</text>
          <picker mode="selector" :range="genders" :value="genderIndex" @change="onGender">
            <view class="picker">{{ form.gender }}<text class="arrow">›</text></view>
          </picker>
        </view>
      </view>
      <view class="field">
        <text class="label">症状与病史 <text class="req">*</text></text>
        <textarea v-model="form.symptoms" class="textarea" placeholder="如：发热 3 天，最高 38.6℃，伴咳嗽、咳黄痰、咽痛" maxlength="1000" />
      </view>
      <view class="field">
        <text class="label">检查检验结果</text>
        <textarea v-model="form.exams" class="textarea" placeholder="如：血常规 WBC 11.2，CRP 32；胸部 CT 右下肺斑片影" maxlength="1000" />
      </view>
      <view class="templates">
        <text v-for="t in templates" :key="t.label" class="template" @click="applyTemplate(t)">{{ t.label }}</text>
      </view>
      <button class="btn-primary submit" :loading="loading" @click="submit">生成诊断建议</button>
    </view>

    <view v-if="result" class="card">
      <view class="triage" :class="{ danger: result.triage?.includes('急') || result.triage?.includes('危') }">{{ result.triage }}</view>

      <text class="section-title">鉴别诊断</text>
      <view v-for="(d, i) in result.possibleDiagnoses || []" :key="i" class="dx">
        <text class="rank">{{ i + 1 }}</text>
        <view class="grow">
          <view class="row">
            <text class="dx-name">{{ d.name }}</text>
            <text v-if="d.icd" class="icd">{{ d.icd }}</text>
            <text class="tag" :class="probTag(d.probability)">{{ d.probability }}</text>
          </view>
          <text class="basis">{{ d.basis }}</text>
        </view>
      </view>

      <text class="section-title">建议检查</text>
      <view class="chips">
        <text v-for="(e, i) in result.recommendedExams || []" :key="i" class="tag tag-green">{{ e }}</text>
      </view>

      <text class="section-title red">危险信号</text>
      <view v-for="(r, i) in result.redFlags || []" :key="i" class="red-flag">• {{ r }}</view>

      <text class="disclaimer">{{ result.disclaimer }}</text>
      <text class="meta">模型 {{ result.model }} · {{ result.durationMs }} ms</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { api } from '@/api';

const genders = ['男', '女'];
const genderIndex = computed(() => Math.max(0, genders.indexOf(form.gender)));
const loading = ref(false);
const result = ref<any>(null);
const form = reactive({ age: '45', gender: '男', symptoms: '', exams: '' });

const templates = [
  { label: '发热咳嗽', age: 35, gender: '男', symptoms: '发热 3 天，最高体温 38.6℃，伴咳嗽、咳黄痰、咽痛，无呼吸困难、无胸痛。', exams: '血常规：WBC 11.2，中性粒细胞 78%，CRP 32 mg/L。' },
  { label: '胸痛胸闷', age: 62, gender: '男', symptoms: '活动后胸骨后压榨性疼痛 2 小时，持续约 10 分钟，休息后缓解，伴大汗、恶心。', exams: '心电图：V1-V4 导联 ST 段压低 0.1 mV；肌钙蛋白 I 0.02 ng/mL。' },
  { label: '腹痛腹泻', age: 28, gender: '女', symptoms: '上腹部阵发性疼痛 1 天，伴恶心、呕吐 3 次，腹泻 2 次稀水样便，无发热。', exams: '血常规：WBC 9.8；腹部超声未见明显异常。' },
  { label: '头晕头痛', age: 70, gender: '女', symptoms: '晨起突发眩晕 2 小时，视物旋转，伴恶心，无耳鸣、无肢体活动障碍。', exams: '血压 165/100 mmHg；头颅 CT 未见出血。' },
];

const probTag = (p: string) => ({ 高: 'tag-red', 中: 'tag-amber', 低: 'tag-green' } as Record<string, string>)[p] || 'tag-gray';

function onGender(e: any) {
  form.gender = genders[Number(e.detail.value)] || '男';
}
function applyTemplate(t: any) {
  form.age = String(t.age);
  form.gender = t.gender;
  form.symptoms = t.symptoms;
  form.exams = t.exams;
}

async function submit() {
  if (form.symptoms.trim().length < 4) {
    uni.showToast({ title: '请至少填写 4 个字的症状', icon: 'none' });
    return;
  }
  loading.value = true;
  try {
    result.value = await api.diagnosis({
      age: Number(form.age) || 0,
      gender: form.gender,
      symptoms: form.symptoms,
      exams: form.exams,
    });
  } catch (e: any) {
    uni.showModal({ title: '生成失败', content: e.message || '未知错误', showCancel: false });
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.head { padding: 8rpx 4rpx 18rpx; }
.title { display: block; font-size: 38rpx; font-weight: 800; }
.sub { display: block; margin-top: 4rpx; color: #64748b; font-size: 21rpx; }
.two { margin-bottom: 14rpx; }
.half { flex: 1; }
.half:first-child { margin-right: 14rpx; }
.label { display: block; font-size: 22rpx; color: #64748b; margin-bottom: 6rpx; }
.req { color: #e5484d; }
.input, .picker { height: 74rpx; line-height: 74rpx; background: #f4f7fa; border-radius: 12rpx; padding: 0 16rpx; font-size: 25rpx; }
.arrow { float: right; color: #94a3b8; }
.field { margin-bottom: 14rpx; }
.textarea { width: 100%; min-height: 140rpx; background: #f4f7fa; border-radius: 12rpx; padding: 14rpx 16rpx; font-size: 24rpx; line-height: 1.65; }
.templates { display: flex; flex-wrap: wrap; margin-bottom: 14rpx; }
.template { padding: 8rpx 16rpx; margin: 0 8rpx 8rpx 0; border: 1rpx solid #b9ded7; border-radius: 999rpx; color: #0b5c56; font-size: 21rpx; }
.submit { height: 84rpx; line-height: 84rpx; }
.triage { padding: 14rpx 18rpx; background: #e9f7f5; color: #0b5c56; border-radius: 10rpx; font-size: 24rpx; margin-bottom: 16rpx; }
.triage.danger { background: #fdeeec; color: #b02a2f; }
.section-title { display: block; margin: 16rpx 0 8rpx; font-size: 26rpx; font-weight: 700; }
.section-title.red { color: #b02a2f; }
.dx { display: flex; padding: 14rpx; background: #fbfdfe; border-radius: 10rpx; margin-bottom: 10rpx; }
.rank { width: 36rpx; height: 36rpx; line-height: 36rpx; text-align: center; background: #e9f7f5; color: #0b5c56; border-radius: 8rpx; font-size: 21rpx; font-weight: 700; margin-right: 12rpx; flex: none; }
.grow { flex: 1; min-width: 0; }
.dx-name { font-size: 25rpx; font-weight: 700; margin-right: 8rpx; }
.icd { color: #64748b; font-size: 19rpx; background: #f1f5f9; padding: 2rpx 8rpx; border-radius: 5rpx; margin-right: 8rpx; }
.basis { display: block; margin-top: 4rpx; color: #64748b; font-size: 21rpx; line-height: 1.6; }
.chips { display: flex; flex-wrap: wrap; }
.chips .tag { margin: 0 8rpx 8rpx 0; }
.red-flag { color: #b02a2f; font-size: 22rpx; line-height: 1.7; }
.disclaimer { display: block; margin-top: 16rpx; color: #94a3b8; font-size: 19rpx; line-height: 1.6; }
.meta { display: block; margin-top: 6rpx; color: #94a3b8; font-size: 19rpx; }
</style>
