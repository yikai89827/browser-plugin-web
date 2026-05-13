<script lang="ts" setup>
import { onUnmounted } from 'vue';
import AccountManagement from './AccountManagement.vue';
import ExtensionMenuGate from '../components/ExtensionMenuGate.vue';
import { accountsShellExtensionReady } from '../lib/accountsRouteGate';

function onGateConnected(ok: boolean) {
  accountsShellExtensionReady.value = ok;
}

onUnmounted(() => {
  accountsShellExtensionReady.value = false;
});
</script>

<template>
  <ExtensionMenuGate @connected="onGateConnected">
    <AccountManagement />
  </ExtensionMenuGate>
</template>
