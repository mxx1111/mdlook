<script setup lang="ts">
import logo from '@/assets/images/favicon.png'

const loading = ref(true)

onMounted(() => {
  setTimeout(() => {
    loading.value = false
  }, 100)
})
</script>

<template>
  <transition name="fade">
    <div
      v-if="loading"
      class="loading"
    >
      <img
        class="loading__icon"
        :src="logo"
        alt="mdlook"
      >
      <strong class="loading__brand">mdlook</strong>
      <span class="loading__desc">看 Markdown，发公众号</span>
      <span class="loading__bar" />
    </div>
  </transition>
</template>

<style lang="less" scoped>
.loading {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 10px;
  width: 100vw;
  height: 100vh;
  color: hsl(var(--foreground));
  background: radial-gradient(circle at 50% 42%, rgb(221 116 82 / 10%), transparent 30%), hsl(var(--background));

  &__icon {
    width: 84px;
    height: 84px;
    border-radius: 20px;
    box-shadow: 0 18px 40px rgb(60 40 30 / 12%);
  }

  &__brand {
    margin-top: 8px;
    font-size: 20px;
    line-height: 1.2;
    font-weight: 700;
  }

  &__desc {
    color: hsl(var(--muted-foreground));
    font-size: 13px;
    line-height: 1.4;
  }

  &__bar {
    position: relative;
    width: 96px;
    height: 3px;
    margin-top: 10px;
    overflow: hidden;
    border-radius: 999px;
    background: rgb(221 116 82 / 16%);

    &::after {
      content: '';
      position: absolute;
      top: 0;
      left: -40%;
      width: 40%;
      height: 100%;
      border-radius: inherit;
      background: #dd7452;
      animation: loading-bar 1.2s ease-in-out infinite;
    }
  }
}

.fade-enter,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-to,
.fade-leave {
  opacity: 1;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.35s ease;
}

@keyframes loading-bar {
  0% {
    transform: translateX(0);
  }

  100% {
    transform: translateX(350%);
  }
}
</style>
