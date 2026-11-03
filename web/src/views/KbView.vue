<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">知识库问答</h1>
        <p class="page-sub">
          RAG 检索增强：先从病历书写规范、质控规则、核心制度中召回片段，再生成带引用的回答
          <span class="tag-ai" style="margin-left: 8px">✦ {{ aiLabel }}</span>
        </p>
      </div>
      <el-button v-if="canEdit" :icon="Plus" @click="openCreate">新增文档</el-button>
    </div>

    <div class="kb-grid">
      <aside class="card side">
        <h3 class="card-title">知识库</h3>
        <div class="stats">
          <div class="stat-item"><strong>{{ stats.documents }}</strong><span>篇文档</span></div>
          <div class="stat-item"><strong>{{ stats.chunks }}</strong><span>个分块</span></div>
          <div class="stat-item"><strong>{{ stats.questions }}</strong><span>次提问</span></div>
        </div>

        <div class="doc-list">
          <div v-for="d in docs" :key="d.id" class="doc">
            <div class="doc-main">
              <div class="doc-title">{{ d.title }}</div>
              <div class="doc-meta">
                <el-tag size="small" effect="plain">{{ categoryText(d.category) }}</el-tag>
                <span class="muted">{{ d.chunk_count }} 段 · {{ d.chars }} 字</span>
              </div>
            </div>
            <el-icon v-if="canEdit" class="del" @click="removeDoc(d)"><Delete /></el-icon>
          </div>
          <el-empty v-if="!docs.length" description="知识库为空" :image-size="60" />
        </div>
      </aside>

      <section class="card main">
        <h3 class="card-title">提问</h3>

        <div class="ask-box">
          <el-input
            v-model="question"
            type="textarea"
            :rows="3"
            resize="none"
            placeholder="例如：现病史应该怎么写才规范？质控评分怎么算？死亡病例讨论有什么要求？"
            @keydown.enter.exact.prevent="ask"
          />
          <div class="ask-actions">
            <div class="suggest">
              <span class="muted">试试：</span>
              <el-tag v-for="q in suggestions" :key="q" class="sug" effect="plain" @click="askQuestion(q)">{{ q }}</el-tag>
            </div>
            <el-button type="primary" :icon="Search" :loading="loading" @click="ask">检索并回答</el-button>
          </div>
        </div>

        <div v-if="result" class="answer">
          <div class="answer-head">
            <span class="tag-ai">✦ {{ modelLabel }}</span>
            <span class="muted">{{ result.latencyMs }} ms · 引用 {{ result.sources.length }} 段</span>
          </div>
          <div class="answer-body pre-wrap">{{ result.answer }}</div>

          <div v-if="result.sources.length" class="sources">
            <h4>引用来源</h4>
            <div v-for="s in result.sources" :key="s.index" class="source">
              <div class="src-head">
                <span class="src-idx">{{ s.index }}</span>
                <span class="src-title">{{ s.title }}</span>
                <el-tag size="small" effect="plain">相关度 {{ s.score }}</el-tag>
              </div>
              <p class="src-snippet">{{ s.snippet }}…</p>
            </div>
          </div>
        </div>

        <el-empty v-else description="输入问题，或点上面的示例" :image-size="80" />
      </section>
    </div>

    <el-dialog v-model="createVisible" title="新增知识文档" width="640px">
      <el-form label-position="top">
        <el-form-item label="标题" required>
          <el-input v-model="form.title" placeholder="如：病历书写基本规范（要点摘编）" />
        </el-form-item>
        <div class="row-2">
          <el-form-item label="分类">
            <el-select v-model="form.category" style="width: 100%">
              <el-option label="书写规范" value="guideline" />
              <el-option label="质控规则" value="qc_rule" />
              <el-option label="制度政策" value="policy" />
              <el-option label="缺陷案例" value="case" />
            </el-select>
          </el-form-item>
          <el-form-item label="来源">
            <el-input v-model="form.source" placeholder="文件号 / 出处" />
          </el-form-item>
        </div>
        <el-form-item label="正文" required>
          <el-input v-model="form.content" type="textarea" :rows="10" placeholder="直接粘贴规范原文，系统会自动切块建索引" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="create">入库</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search, Delete } from '@element-plus/icons-vue';
import { api, kbApi } from '@/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const canEdit = computed(() => auth.canQC);

const docs = ref<any[]>([]);
const stats = ref({ documents: 0, chunks: 0, questions: 0 });
const question = ref('');
const loading = ref(false);
const result = ref<any>(null);
const aiLabel = ref('检索增强');

const createVisible = ref(false);
const saving = ref(false);
const form = ref<any>({ title: '', category: 'guideline', source: '', content: '' });

const suggestions = ['现病史应该怎么写？', '质控评分怎么算？', '死亡病例讨论的要求', '诊断名称怎么规范书写'];

const categoryText = (c: string) =>
  ({ guideline: '书写规范', qc_rule: '质控规则', policy: '制度政策', case: '缺陷案例' }[c] || c);

const modelLabel = computed(() => {
  const m = result.value?.model || '';
  if (m.includes('extractive')) return '抽取式回答（未配置大模型）';
  if (m.includes('deepseek')) return 'DeepSeek 归纳';
  return m || '检索结果';
});

async function load() {
  const [d, s] = await Promise.all([kbApi.documents(), kbApi.stats()]);
  docs.value = d;
  stats.value = s;
}

async function ask() {
  const q = question.value.trim();
  if (q.length < 2) {
    ElMessage.warning('请输入问题');
    return;
  }
  loading.value = true;
  try {
    result.value = await kbApi.ask(q, 5);
    stats.value.questions += 1;
  } finally {
    loading.value = false;
  }
}

function askQuestion(q: string) {
  question.value = q;
  ask();
}

function openCreate() {
  form.value = { title: '', category: 'guideline', source: '', content: '' };
  createVisible.value = true;
}

async function create() {
  if (!form.value.title || !form.value.content) {
    ElMessage.warning('标题和正文必填');
    return;
  }
  saving.value = true;
  try {
    const res: any = await kbApi.createDocument(form.value);
    ElMessage.success(`已入库，切成 ${res.chunkCount} 段`);
    createVisible.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

async function removeDoc(d: any) {
  await ElMessageBox.confirm(`删除《${d.title}》及其分块？`, '提示', { type: 'warning' });
  await kbApi.deleteDocument(d.id);
  ElMessage.success('已删除');
  await load();
}

onMounted(async () => {
  await load();
  try {
    const s = await api.aiStatus();
    aiLabel.value = s.remote ? 'DeepSeek 生成' : '抽取式回答';
  } catch { /* ignore */ }
});
</script>

<style scoped>
.kb-grid { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 16px; align-items: start; }

.side { display: flex; flex-direction: column; }
.stats { display: flex; gap: 18px; margin-bottom: 14px; }
.stat-item { display: flex; flex-direction: column; }
.stat-item strong { font-size: 20px; }
.stat-item span { font-size: 11.5px; color: var(--ink-500); }

.doc-list { max-height: 520px; overflow: auto; }
.doc { display: flex; align-items: flex-start; gap: 8px; padding: 10px 8px; border-bottom: 1px solid var(--line); }
.doc:last-child { border-bottom: none; }
.doc-main { flex: 1; min-width: 0; }
.doc-title { font-size: 13px; font-weight: 600; margin-bottom: 5px; }
.doc-meta { display: flex; align-items: center; gap: 8px; }
.del { color: #cbd5e1; cursor: pointer; }
.del:hover { color: #e5484d; }

.main { min-height: 420px; }
.ask-actions { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; margin-top: 10px; flex-wrap: wrap; }
.suggest { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.sug { cursor: pointer; }
.sug:hover { color: var(--brand-600); border-color: var(--brand-400); }

.answer { margin-top: 20px; padding-top: 16px; border-top: 1px dashed var(--line); }
.answer-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.answer-body { font-size: 14px; line-height: 1.9; color: var(--ink-900); background: #fbfdfe; border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; }

.sources { margin-top: 18px; }
.sources h4 { font-size: 13px; margin: 0 0 10px; }
.source { border: 1px solid var(--line); border-radius: 9px; padding: 10px 12px; margin-bottom: 8px; background: #fff; }
.src-head { display: flex; align-items: center; gap: 8px; }
.src-idx {
  width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center;
  background: var(--brand-50); color: var(--brand-700); font-size: 11.5px; font-weight: 700;
}
.src-title { font-size: 13px; font-weight: 600; flex: 1; }
.src-snippet { margin: 6px 0 0; font-size: 12.5px; color: var(--ink-500); line-height: 1.7; }

.row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

@media (max-width: 1100px) {
  .kb-grid { grid-template-columns: 1fr; }
}
</style>
