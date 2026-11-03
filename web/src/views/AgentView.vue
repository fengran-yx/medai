<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">AI 质控助手</h1>
        <p class="page-sub">
          Agent 会自动规划步骤、调用工具（查病历 / 跑质控 / 出统计），并汇总结果
          <span class="tag-ai" style="margin-left: 8px">✦ {{ modeLabel }}</span>
        </p>
      </div>
    </div>

    <div class="agent-grid">
      <section class="card main">
        <h3 class="card-title">告诉它你要做什么</h3>

        <el-input
          v-model="goal"
          type="textarea"
          :rows="3"
          resize="none"
          placeholder="例如：把最近质控不通过的病历重新质控，并给出本周质控周报"
          @keydown.enter.exact.prevent="run"
        />

        <div class="presets">
          <span class="muted">常用指令：</span>
          <el-tag v-for="p in presets" :key="p" effect="plain" class="preset" @click="usePreset(p)">{{ p }}</el-tag>
        </div>

        <div class="run-bar">
          <el-button type="primary" :icon="Promotion" :loading="running" @click="run">执行</el-button>
          <span v-if="result" class="muted">
            {{ result.model }} · {{ result.steps.length }} 步 · {{ result.durationMs }} ms
          </span>
        </div>

        <div v-if="result" class="result">
          <div class="steps">
            <div v-for="s in result.steps" :key="s.step" class="step">
              <div class="step-head">
                <span class="step-idx">{{ s.step }}</span>
                <code class="tool">{{ s.tool }}</code>
                <span class="args">{{ fmtArgs(s.args) }}</span>
                <span class="muted">{{ s.ms }} ms</span>
              </div>
              <div class="step-result">{{ fmtResult(s.result) }}</div>
            </div>
          </div>

          <div class="answer">
            <div class="answer-head">
              <span class="tag-ai">✦ 最终答复</span>
              <span v-if="result.status === 'fallback'" class="muted">（规则编排兜底）</span>
            </div>
            <div class="md-body" v-html="answerHtml"></div>
          </div>
        </div>

        <el-empty v-else description="输入指令，Agent 会自动拆解并调用工具" :image-size="80" />
      </section>

      <aside class="card side">
        <h3 class="card-title">可用工具</h3>
        <div v-for="t in tools" :key="t.name" class="tool-item">
          <code>{{ t.name }}</code>
          <p>{{ t.description }}</p>
        </div>

        <h3 class="card-title" style="margin-top: 18px">最近运行</h3>
        <div class="history">
          <div v-for="h in history" :key="h.id" class="his" @click="replay(h.id)">
            <div class="his-goal">{{ h.goal }}</div>
            <div class="his-meta">
              <el-tag size="small" effect="plain">{{ h.model }}</el-tag>
              <span class="muted">{{ h.step_count }} 步 · {{ h.duration_ms }}ms</span>
            </div>
          </div>
          <el-empty v-if="!history.length" description="还没有运行记录" :image-size="60" />
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Promotion } from '@element-plus/icons-vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { agentApi, api } from '@/api';

const goal = ref('');
const running = ref(false);
const result = ref<any>(null);
const tools = ref<any[]>([]);
const history = ref<any[]>([]);
const remote = ref(false);

const presets = [
  '把最近质控不通过的病历重新质控，并给出本周质控周报',
  '统计最近 7 天的质控情况，列出高频问题',
  '查一下内科的病历质控情况',
];

const modeLabel = computed(() => (remote.value ? '大模型编排' : '规则编排'));

/** 把模型返回的 Markdown 渲染成 HTML（先消毒，防 XSS） */
const answerHtml = computed(() => {
  const raw = result.value?.answer || '';
  if (!raw) return '';
  const html = marked.parse(raw, { breaks: true, gfm: true }) as string;
  return DOMPurify.sanitize(html);
});

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
  return JSON.stringify(r).slice(0, 80);
};

function usePreset(p: string) {
  goal.value = p;
}

async function run() {
  const g = goal.value.trim();
  if (g.length < 4) {
    ElMessage.warning('请描述你要做什么');
    return;
  }
  running.value = true;
  try {
    result.value = await agentApi.run(g);
    await loadHistory();
  } finally {
    running.value = false;
  }
}

async function replay(id: number) {
  const d = await agentApi.runDetail(id);
  result.value = {
    ...d,
    steps: d.steps || [],
    durationMs: d.duration_ms,
    model: d.model,
    status: d.status,
  };
}

async function loadHistory() {
  history.value = await agentApi.runs(8);
}

onMounted(async () => {
  tools.value = await agentApi.tools();
  await loadHistory();
  try {
    const s = await api.aiStatus();
    remote.value = s.remote;
  } catch { /* ignore */ }
});
</script>

<style scoped>
.agent-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }

.presets { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 12px 0; }
.preset { cursor: pointer; }
.preset:hover { color: var(--brand-600); border-color: var(--brand-400); }

.run-bar { display: flex; align-items: center; gap: 12px; }

.result { margin-top: 20px; border-top: 1px dashed var(--line); padding-top: 16px; }

.steps { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
.step { border: 1px solid var(--line); border-radius: 9px; padding: 10px 12px; background: #fcfdfe; }
.step-head { display: flex; align-items: center; gap: 8px; }
.step-idx {
  width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center;
  background: var(--brand-50); color: var(--brand-700); font-size: 11px; font-weight: 700;
}
.tool { font-size: 12px; background: #eef4f8; padding: 2px 7px; border-radius: 5px; color: #33596b; }
.args { font-size: 11.5px; color: var(--ink-500); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.step-result { margin-top: 6px; font-size: 12.5px; color: var(--ink-700); line-height: 1.7; }

.answer { background: var(--brand-50); border-radius: 10px; padding: 14px 18px; }
.answer-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }

/* Markdown 渲染样式 */
.md-body { font-size: 13.5px; line-height: 1.85; color: var(--ink-900); }
.md-body :deep(h1), .md-body :deep(h2), .md-body :deep(h3) {
  font-size: 14.5px; margin: 14px 0 8px; font-weight: 700; color: var(--ink-900);
}
.md-body :deep(h1) { font-size: 16px; }
.md-body :deep(p) { margin: 6px 0; }
.md-body :deep(ul), .md-body :deep(ol) { margin: 6px 0; padding-left: 20px; }
.md-body :deep(li) { margin: 3px 0; }
.md-body :deep(strong) { color: var(--brand-700); }
.md-body :deep(table) {
  width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12.5px; background: #fff;
  border-radius: 8px; overflow: hidden;
}
.md-body :deep(th), .md-body :deep(td) {
  border: 1px solid var(--line); padding: 6px 10px; text-align: left;
}
.md-body :deep(th) { background: #f4f8fa; font-weight: 600; }
.md-body :deep(code) {
  background: #fff; padding: 1px 6px; border-radius: 4px; font-size: 12px;
  border: 1px solid var(--line);
}
.md-body :deep(blockquote) {
  margin: 8px 0; padding: 6px 12px; border-left: 3px solid var(--brand-400);
  background: #fff; color: var(--ink-700); border-radius: 0 6px 6px 0;
}

.side { max-height: 640px; overflow: auto; }
.tool-item { margin-bottom: 12px; }
.tool-item code { font-size: 11.5px; background: #eef4f8; padding: 2px 7px; border-radius: 5px; color: #33596b; }
.tool-item p { margin: 5px 0 0; font-size: 12px; color: var(--ink-500); line-height: 1.6; }

.his { padding: 9px 10px; border-radius: 8px; cursor: pointer; border: 1px solid transparent; }
.his:hover { background: #f6f9fb; border-color: var(--line); }
.his-goal { font-size: 12.5px; color: var(--ink-900); margin-bottom: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.his-meta { display: flex; align-items: center; gap: 8px; }

@media (max-width: 1100px) {
  .agent-grid { grid-template-columns: 1fr; }
}
</style>
