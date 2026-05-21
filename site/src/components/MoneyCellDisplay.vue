<script lang="ts" setup>
import type { MoneyDisplay } from '../../../utils/fb/adAccount/moneyDisplay';

defineProps<{
  display: MoneyDisplay;
}>();
</script>

<template>
  <div class="money-cell">
    <span>{{ display.primary }}</span>
    <span v-if="display.secondary" class="money-sub">{{ display.secondary }}</span>
  </div>
</template>

<style scoped>
.money-cell {
  line-height: 1.25;
}
.money-sub {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: #1877f2;
  font-weight: 500;
}
</style>
