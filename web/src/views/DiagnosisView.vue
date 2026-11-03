<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">AI 辅助诊断</h1>
        <p class="page-sub">
          录入症状与检查结果，生成结构化鉴别诊断参考
          <span class="tag-ai" style="margin-left: 8px">✦ {{ aiProvider }}</span>
        </p>
      </div>
    </div>

    <div class="dx-grid">
      <div class="card">
        <h3 class="card-title">患者信息</h3>
        <el-form label-position="top">
          <div class="row-2">
            <el-form-item label="年龄">
              <el-input-number v-model="form.age" :min="0" :max="120" controls-position="right" style="width: 100%" />
            </el-form-item>
            <el-form-item label="性别">
              <el-select v-model="form.gender" style="width: 100%">
                <el-option label="男" value="男" />
                <el-option label="女" value="女" />
              </el-select>
            </el-form-item>
          </div>
          <el-form-item label="症状与病史" required>
            <el-input v-model="form.symptoms" type="textarea" :rows="5" placeholder="如：发热 3 天，最高 38.6℃，伴咳嗽、咳黄痰、咽痛，无呼吸困难" />
          </el-form-item>
          <el-form-item label="检查检验结果">
            <el-input v-model="form.exams" type="textarea" :rows="4" placeholder="如：血常规 WBC 11.2×10⁹/L，CRP 32 mg/L；胸部 CT 右下肺斑片影" />
          </el-form-item>
          <div class="quick">
            <span class="muted">快速填入：</span>
            <el-tag v-for="t in templates" :key="t.label" class="quick-tag" effect="plain" @click="applyTemplate(t)">
              {{ t.label }}
            </el-tag>
          </div>
          <el-button type="primary" class="submit" :loading="loading" :icon="MagicStick" @click="submit">
            生成诊断建议
          </el-button>
        </el-form>
      </div>

      <div class="card result">
        <h3 class="card-title">诊断建议</h3>
        <div v-if="!result" class="empty-hint">
          <el-icon :size="36" color="#cbd5e1"><FirstAidKit /></el-icon>
          <p>填写左侧信息后生成<br />AI 将给出鉴别诊断、检查建议与危险信号</p>
        </div>

        <template v-else>
          <div class="triage" :class="triageClass">
            <el-icon><Bell /></el-icon>
            <span>{{ result.triage }}</span>
          </div>

          <h4 class="sec">鉴别诊断</h4>
          <div v-for="(d, i) in result.possibleDiagnoses" :key="i" class="dx-item">
            <div class="dx-rank">{{ i + 1 }}</div>
            <div class="dx-main">
              <div class="dx-name">
                {{ d.name }}
                <code v-if="d.icd">{{ d.icd }}</code>
                <el-tag :type="probType(d.probability)" size="small" effect="light">{{ d.probability }}</el-tag>
              </div>
              <p class="dx-basis">{{ d.basis }}</p>
            </div>
          </div>

          <h4 class="sec">建议检查</h4>
          <div class="chips">
            <el-tag v-for="(e, i) in result.recommendedExams" :key="i" type="info" effect="plain" size="large">{{ e }}</el-tag>
          </div>

          <h4 class="sec">⚠ 危险信号（立即处理）</h4>
          <ul class="red-flags">
            <li v-for="(r, i) in result.redFlags" :key="i">{{ r }}</li>
          </ul>

          <p class="disclaimer">{{ result.disclaimer }}</p>
          <div class="meta">
            <span class="muted">模型：{{ result.model }}</span>
            <span class="muted">耗时：{{ result.durationMs }} ms</span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { MagicStick, FirstAidKit, Bell } from '@element-plus/icons-vue';
import { api } from '@/api';

const form = ref({ age: 45, gender: '男', symptoms: '', exams: '' });
const loading = ref(false);
const result = ref<any>(null);
const aiProvider = ref('规则引擎');

const templates = [
  { label: '发热咳嗽', age: 35, gender: '男', symptoms: '发热 3 天，最高体温 38.6℃，伴咳嗽、咳黄痰、咽痛，无呼吸困难、无胸痛。', exams: '血常规：WBC 11.2×10⁹/L，中性粒细胞 78%，CRP 32 mg/L。' },
  { label: '胸痛胸闷', age: 62, gender: '男', symptoms: '活动后胸骨后压榨性疼痛 2 小时，持续约 10 分钟，休息后缓解，伴大汗、恶心。', exams: '心电图：V1-V4 导联 ST 段压低 0.1 mV；肌钙蛋白 I 0.02 ng/mL。' },
  { label: '腹痛腹泻', age: 28, gender: '女', symptoms: '上腹部阵发性疼痛 1 天，伴恶心、呕吐 3 次，腹泻 2 次稀水样便，无发热。', exams: '血常规：WBC 9.8×10⁹/L；腹部超声未见明显异常。' },
  { label: '头晕头痛', age: 70, gender: '女', symptoms: '晨起突发眩晕 2 小时，视物旋转，伴恶心，无耳鸣、无肢体活动障碍。', exams: '血压 165/100 mmHg；头颅 CT 未见出血。' },
];

const triageClass = ref('info');
const probType = (p: string) => (p === '高' ? 'danger' : p === '中' ? 'warning' : 'info') as any;

function applyTemplate(t: any) {
  form.value = { age: t.age, gender: t.gender, symptoms: t.symptoms, exams: t.exams };
}

async function submit() {
  if (!form.value.symptoms || form.value.symptoms.length < 4) {
    ElMessage.warning('请至少填写 4 个字的症状描述');
    return;
  }
  loading.value = true;
  try {
    const data = await api.diagnosis(form.value);
    result.value = data;
    triageClass.value = data.possibleDiagnoses?.[0]?.probability === '高' ? 'danger' : 'info';
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    const s = await api.aiStatus();
    aiProvider.value = s.provider;
  } catch { /* ignore */ }
});
</script>

<style scoped>
.dx-grid { display: grid; grid-template-columns: minmax(360px, 0.9fr) minmax(0, 1.1fr); gap: 16px; align-items: start; }
.row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.quick { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 16px; }
.quick-tag { cursor: pointer; transition: all 0.15s; }
.quick-tag:hover { color: var(--brand-600); border-color: var(--brand-400); background: var(--brand-50); }
.submit { width: 100%; }

.result { min-height: 400px; }
.triage {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; border-radius: 9px; font-size: 13px;
  background: var(--brand-50); color: var(--brand-700); margin-bottom: 18px;
}
.triage.danger { background: #fff1f0; color: #c0392b; }

.sec { font-size: 13px; margin: 18px 0 10px; color: var(--ink-700); }

.dx-item { display: flex; gap: 12px; padding: 12px; border: 1px solid var(--line); border-radius: 10px; margin-bottom: 9px; }
.dx-rank {
  width: 24px; height: 24px; border-radius: 7px; flex: none;
  display: grid; place-items: center; font-size: 12px; font-weight: 700;
  background: var(--brand-50); color: var(--brand-700);
}
.dx-main { flex: 1; min-width: 0; }
.dx-name { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; flex-wrap: wrap; }
.dx-name code { font-size: 11px; font-weight: 400; color: var(--ink-500); background: #f1f5f9; padding: 1px 6px; border-radius: 4px; }
.dx-basis { margin: 5px 0 0; font-size: 12.5px; color: var(--ink-500); line-height: 1.65; }

.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.red-flags { margin: 0; padding-left: 18px; }
.red-flags li { font-size: 12.5px; color: #c0392b; line-height: 1.9; }

.disclaimer { margin-top: 18px; font-size: 11.5px; color: #94a3b8; line-height: 1.7; }
.meta { display: flex; gap: 16px; margin-top: 8px; }

@media (max-width: 1100px) {
  .dx-grid { grid-template-columns: 1fr; }
}
</style>
