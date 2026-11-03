<template>
  <div class="page chat-page">
    <div class="page-head">
      <div>
        <h1 class="page-title">AI 医学助手</h1>
        <p class="page-sub">病历质控、临床知识、系统操作问题均可提问</p>
      </div>
    </div>

    <div class="chat-wrap">
      <aside class="sessions card">
        <el-button class="new-chat" :icon="Plus" @click="newChat">新建会话</el-button>
        <div class="session-list">
          <div
            v-for="s in chats"
            :key="s.id"
            class="session"
            :class="{ active: s.id === chatId }"
            @click="openChat(s.id)"
          >
            <div class="s-title">{{ s.title }}</div>
            <div class="s-sub">{{ fmt(s.updated_at) }}</div>
            <el-icon class="del" @click.stop="removeChat(s.id)"><Delete /></el-icon>
          </div>
          <el-empty v-if="!chats.length" description="暂无会话" :image-size="60" />
        </div>
      </aside>

      <section class="chat-main card">
        <div ref="listRef" class="msg-list">
          <div v-if="!messages.length" class="welcome">
            <div class="w-icon">＋</div>
            <h3>我是智医助手</h3>
            <p>可以帮你解释质控规则、分析临床问题、梳理病历书写要点。</p>
            <div class="suggest">
              <button v-for="q in quickQuestions" :key="q" @click="send(q)">{{ q }}</button>
            </div>
          </div>

          <div v-for="(m, i) in messages" :key="i" class="chat-msg" :class="m.role === 'user' ? 'user' : 'ai'">
            <div class="avatar">{{ m.role === 'user' ? '我' : 'AI' }}</div>
            <div class="bubble">{{ m.content }}</div>
          </div>

          <div v-if="sending" class="chat-msg ai">
            <div class="avatar">AI</div>
            <div class="bubble typing"><span /><span /><span /></div>
          </div>
        </div>

        <div class="composer">
          <el-input
            v-model="input"
            type="textarea"
            :rows="2"
            resize="none"
            placeholder="输入问题，Enter 发送，Shift + Enter 换行"
            @keydown.enter.exact.prevent="send()"
          />
          <el-button type="primary" :icon="Promotion" :loading="sending" @click="send()">发送</el-button>
        </div>
        <p class="foot-tip">AI 生成内容仅供临床参考，不能替代医师判断；请勿输入可识别患者身份的信息。</p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Promotion, Delete } from '@element-plus/icons-vue';
import { api } from '@/api';

const chats = ref<any[]>([]);
const chatId = ref<number | null>(null);
const messages = ref<any[]>([]);
const input = ref('');
const sending = ref(false);
const listRef = ref<HTMLElement>();

const quickQuestions = [
  '病历质控主要看哪些维度？',
  '老年高血压患者用药注意事项',
  '糖尿病酮症酸中毒的早期识别',
  '现病史应该怎么写才规范？',
];

const fmt = (s: string) => (s ? String(s).slice(5, 16) : '');

async function loadChats() {
  chats.value = await api.chats();
}

async function openChat(id: number) {
  chatId.value = id;
  const data = await api.chatMessages(id);
  messages.value = data.messages;
  scrollBottom();
}

function newChat() {
  chatId.value = null;
  messages.value = [];
  input.value = '';
}

async function removeChat(id: number) {
  await ElMessageBox.confirm('删除后不可恢复，确定删除该会话？', '提示', { type: 'warning' });
  await api.deleteChat(id);
  if (chatId.value === id) newChat();
  await loadChats();
}

async function send(text?: string) {
  const content = (text ?? input.value).trim();
  if (!content || sending.value) return;
  input.value = '';
  messages.value.push({ role: 'user', content });
  sending.value = true;
  scrollBottom();
  try {
    const res = await api.sendChat({ chatId: chatId.value ?? undefined, message: content });
    chatId.value = res.chatId;
    messages.value.push({ role: 'assistant', content: res.content });
    await loadChats();
  } catch {
    messages.value.pop();
  } finally {
    sending.value = false;
    scrollBottom();
  }
}

function scrollBottom() {
  nextTick(() => {
    const el = listRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

onMounted(loadChats);
</script>

<style scoped>
.chat-page { height: 100%; display: flex; flex-direction: column; }
.chat-wrap { flex: 1; display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 16px; min-height: 0; height: calc(100vh - 190px); }

.sessions { padding: 14px; display: flex; flex-direction: column; min-height: 0; }
.new-chat { width: 100%; margin-bottom: 12px; }
.session-list { flex: 1; overflow: auto; }
.session {
  position: relative; padding: 10px 12px; border-radius: 9px; cursor: pointer; margin-bottom: 4px;
  transition: background 0.15s;
}
.session:hover { background: #f6f9fb; }
.session.active { background: var(--brand-50); box-shadow: inset 2px 0 0 var(--brand-500); }
.s-title { font-size: 12.5px; color: var(--ink-900); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 18px; }
.s-sub { font-size: 11px; color: var(--ink-500); margin-top: 3px; }
.del { position: absolute; right: 8px; top: 12px; font-size: 13px; color: #cbd5e1; display: none; }
.session:hover .del { display: block; }
.del:hover { color: #e5484d; }

.chat-main { display: flex; flex-direction: column; min-height: 0; padding: 0; overflow: hidden; }
.msg-list { flex: 1; overflow: auto; padding: 20px 22px; }

.welcome { text-align: center; padding-top: 40px; }
.w-icon {
  width: 52px; height: 52px; margin: 0 auto 12px; border-radius: 16px;
  display: grid; place-items: center; font-size: 24px; color: #fff;
  background: linear-gradient(135deg, var(--brand-400), var(--brand-700));
  box-shadow: 0 10px 24px rgba(15, 139, 127, 0.25);
}
.welcome h3 { margin: 0 0 8px; font-size: 18px; }
.welcome p { color: var(--ink-500); font-size: 13px; margin: 0 0 22px; }
.suggest { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; max-width: 520px; margin: 0 auto; }
.suggest button {
  padding: 8px 14px; border-radius: 999px; border: 1px solid var(--line); background: #fff;
  font-size: 12.5px; color: var(--ink-700); cursor: pointer; transition: all 0.15s;
}
.suggest button:hover { border-color: var(--brand-400); color: var(--brand-700); background: var(--brand-50); }

.composer { display: flex; gap: 10px; padding: 12px 16px; border-top: 1px solid var(--line); align-items: flex-end; }
.composer :deep(.el-textarea__inner) { border-radius: 10px; font-size: 13.5px; padding: 10px 12px; }
.foot-tip { margin: 0; padding: 0 16px 10px; font-size: 11px; color: #94a3b8; }

.typing { display: flex; gap: 4px; padding: 14px 16px !important; }
.typing span {
  width: 6px; height: 6px; border-radius: 50%; background: var(--brand-400);
  animation: blink 1.2s infinite;
}
.typing span:nth-child(2) { animation-delay: 0.2s; }
.typing span:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink { 0%, 60%, 100% { opacity: 0.25; } 30% { opacity: 1; } }

@media (max-width: 1000px) {
  .chat-wrap { grid-template-columns: 1fr; height: auto; }
  .sessions { display: none; }
}
</style>
