<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';

onLaunch(() => {
  if (!uni.getStorageSync('medai_token')) {
    uni.reLaunch({ url: '/pages/login/index' });
  }
});
</script>

<style>
page {
  background: #f4f7fa;
  color: #0f172a;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

view, text, input, textarea, button,
uni-page, uni-view, uni-text, uni-input, uni-textarea, uni-button {
  box-sizing: border-box;
}

.page {
  min-height: 100vh;
  padding: 24rpx 28rpx 48rpx;
}

.card {
  background: #ffffff;
  border-radius: 24rpx;
  padding: 28rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 8rpx 32rpx rgba(15, 23, 42, 0.06);
}

.row {
  display: flex;
  align-items: center;
}

.spacer {
  flex: 1;
}

.muted {
  color: #64748b;
  font-size: 24rpx;
}

.brand {
  color: #0f8b7f;
}

.btn-primary {
  background: linear-gradient(135deg, #0f8b7f, #0b5c56);
  color: #ffffff;
  border-radius: 16rpx;
  font-size: 30rpx;
  font-weight: 600;
  border: none;
}

.btn-primary::after {
  border: none;
}

.tag {
  display: inline-block;
  padding: 4rpx 14rpx;
  border-radius: 8rpx;
  font-size: 22rpx;
  line-height: 1.5;
}

.tag-green { background: #e9f7f5; color: #0b5c56; }
.tag-red { background: #fdecec; color: #c0353a; }
.tag-amber { background: #fff5e6; color: #a86400; }
.tag-gray { background: #eef2f7; color: #475569; }

.empty {
  padding: 80rpx 0;
  text-align: center;
  color: #94a3b8;
  font-size: 26rpx;
}
</style>
