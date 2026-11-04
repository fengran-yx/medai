<template>
  <view class="chat-page">
    <view class="topbar">
      <view class="grow">
        <text class="title">AI 医学助手</text>
        <text class="sub">质控规则、临床知识、病历书写</text>
      </view>
      <text class="new-btn" @click="newChat">+ 新会话</text>
    </view>

    <scroll-view scroll-y class="msg-list" :scroll-into-view="lastId" :scroll-with-animation="true">
      <view v-if="!messages.length" class="welcome">
        <view class="w-icon">AI</view>
        <text class="w-title">我是智医助手</text>
        <text class="w-sub">可以帮你解释质控规则、分析临床问题、梳理病历书写要点。</text>
        <view class="suggest">
          <text v-for="q in quickQuestions" :key="q" class="suggest-item" @click="send(q)">{{ q }}</text>
        </view>
      </view>

      <view v-for="(m, i) in messages" :id="`m${i}`" :key="i" class="msg" :class="m.role">
        <view class="avatar">{{ m.role === 'user' ? '我' : 'AI' }}</view>
        <view class="bubble">{{ m.role === 'assistant' ? clean(m.content) : m.content }}</view>
      </view>
      <view v-if="sending" id="typing" class="msg assistant">
        <view class="avatar">AI</view>
        <view class="bubble typing">正在思考…</view>
      </view>
      <view id="bottom" class="bottom-space"></view>
    </scroll-view>

    <view class="composer">
      <textarea v-model="input" class="input" placeholder="输入问题，如：现病史怎么写才规范？" maxlength="1000" auto-height />
      <button class="btn-primary send" :loading="sending" @click="send()">发送</button>
    </view>
    <text class="foot-tip">AI 内容仅供临床参考，不能替代医师判断；请勿输入可识别患者身份的信息。</text>
  </view>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { api } from '@/api';

const chats = ref<any[]>([]);
const chatId = ref<number | null>(null);
const messages = ref<any[]>([]);
const input = ref('');
const sending = ref(false);
const lastId = ref('bottom');

const quickQuestions = [
  '病历质控主要看哪些维度？',
  '老年高血压患者用药注意事项',
  '糖尿病酮症酸中毒的早期识别',
  '现病史应该怎么写才规范？',
];

const clean = (s: string) => String(s || '')
  .replace(/^#{1,6}\s*/gm, '')
  .replace(/\*\*(.*?)\*\*/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/^\s*[-*]\s+/gm, '• ');

function scrollBottom() {
  nextTick(() => { lastId.value = `m${Math.max(0, messages.value.length - 1)}`; });
}

async function loadChats() {
  try {
    chats.value = await api.chats();
    if (chats.value.length) {
      await openChat(chats.value[0].id);
    }
  } catch {
    // 首次使用没有会话
  }
}

async function openChat(id: number) {
  try {
    chatId.value = id;
    const data = await api.chatMessages(id);
    messages.value = data.messages || [];
    scrollBottom();
  } catch (e: any) {
    uni.showToast({ title: e.message || '加载会话失败', icon: 'none' });
  }
}

function newChat() {
  chatId.value = null;
  messages.value = [];
  input.value = '';
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
    chats.value = await api.chats().catch(() => chats.value);
    scrollBottom();
  } catch (e: any) {
    messages.value.pop();
    uni.showModal({ title: '发送失败', content: e.message || '未知错误', showCancel: false });
  } finally {
    sending.value = false;
  }
}

onShow(loadChats);
</script>

<style scoped>
.chat-page { height: 100vh; display: flex; flex-direction: column; background: #f4f7fa; padding: 18rpx 24rpx; box-sizing: border-box; }
.topbar { display: flex; align-items: flex-start; padding: 4rpx 4rpx 14rpx; }
.grow { flex: 1; }
.title { display: block; font-size: 34rpx; font-weight: 800; }
.sub { display: block; margin-top: 2rpx; color: #64748b; font-size: 20rpx; }
.new-btn { color: #0f8b7f; font-size: 23rpx; border: 1rpx solid #b9ded7; border-radius: 999rpx; padding: 8rpx 16rpx; }
.msg-list { flex: 1; height: 0; }
.welcome { text-align: center; padding: 50rpx 20rpx; }
.w-icon { width: 90rpx; height: 90rpx; line-height: 90rpx; margin: 0 auto 14rpx; border-radius: 26rpx; background: linear-gradient(135deg,#2ec4b0,#0b5c56); color: #fff; font-size: 30rpx; font-weight: 800; }
.w-title { display: block; font-size: 30rpx; font-weight: 800; }
.w-sub { display: block; margin-top: 8rpx; color: #64748b; font-size: 22rpx; line-height: 1.6; }
.suggest { display: flex; flex-wrap: wrap; justify-content: center; margin-top: 22rpx; }
.suggest-item { margin: 0 8rpx 10rpx 0; padding: 10rpx 16rpx; background: #fff; border: 1rpx solid #e2e8f0; border-radius: 999rpx; color: #334155; font-size: 21rpx; }
.msg { display: flex; align-items: flex-start; margin-bottom: 18rpx; }
.msg.user { flex-direction: row-reverse; }
.avatar { width: 58rpx; height: 58rpx; line-height: 58rpx; text-align: center; border-radius: 18rpx; background: #0f8b7f; color: #fff; font-size: 20rpx; font-weight: 700; flex: none; margin: 0 12rpx; }
.msg.assistant .avatar { background: #0b5c56; }
.bubble { max-width: 76%; padding: 16rpx 18rpx; background: #fff; border-radius: 16rpx; font-size: 24rpx; line-height: 1.7; color: #1e293b; white-space: pre-wrap; word-break: break-word; }
.msg.user .bubble { background: #dff5f0; }
.typing { color: #94a3b8; }
.bottom-space { height: 10rpx; }
.composer { display: flex; align-items: flex-end; padding-top: 10rpx; }
.input { flex: 1; min-height: 76rpx; max-height: 180rpx; background: #fff; border-radius: 14rpx; padding: 16rpx 18rpx; font-size: 24rpx; line-height: 1.5; }
.send { margin-left: 12rpx; width: 130rpx; height: 76rpx; line-height: 76rpx; font-size: 24rpx; }
.foot-tip { display: block; padding: 10rpx 4rpx calc(4rpx + env(safe-area-inset-bottom)); color: #94a3b8; font-size: 18rpx; line-height: 1.5; }
</style>
