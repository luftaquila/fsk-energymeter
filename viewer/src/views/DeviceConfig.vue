<script setup>
import { ref } from 'vue'
import { useDeviceStore } from '../stores/device'
import { useNotification } from '../composables/useNotification'
import { formatUid } from '../lib/energymeter'

const deviceStore = useDeviceStore()
const notyf = useNotification()
const deleteUnlocked = ref(false)

async function handleConnect() { try { await deviceStore.connect(); notyf.success('Device connected') } catch (e) { notyf.error(`Connection failed: ${e.message}`) } }
async function handleRefresh() { try { await deviceStore.updateDeviceInfo(); notyf.success('Device info refreshed') } catch (e) { notyf.error(`Refresh failed: ${e.message}`) } }
async function handleSyncRtc() { try { await deviceStore.syncRtc(); notyf.success('RTC synchronized') } catch (e) { notyf.error(`RTC sync failed: ${e.message}`) } }
async function handleDelete() { try { await deviceStore.deleteRecords(); notyf.success('All records deleted'); deleteUnlocked.value = false } catch (e) { notyf.error(`Delete failed: ${e.message}`) } }
</script>

<template>
  <div class="device-config">
    <div class="card fade-in">
      <div class="card-header"><h3><i class="fas fa-microchip"></i> Device</h3></div>
      <div class="card-body">
        <table class="stats-table">
          <tr><td>ID</td><td>{{ deviceStore.uid ? formatUid(deviceStore.uid) : 'UNKNOWN' }}</td></tr>
          <tr><td>TIME</td><td>{{ deviceStore.deviceTime || 'N/A' }}</td></tr>
        </table>
        <div class="button-group">
          <button class="btn" :class="deviceStore.connected ? 'btn-success' : 'btn-warning'" :disabled="deviceStore.connected" @click="handleConnect"><i class="fab fa-usb"></i>{{ deviceStore.connected ? 'Connected' : 'Connect' }}</button>
          <button class="btn btn-primary" :disabled="!deviceStore.connected" @click="handleRefresh"><i class="fas fa-stopwatch"></i>Refresh</button>
        </div>
      </div>
    </div>

    <div class="card fade-in" style="animation-delay:0.1s">
      <div class="card-header"><h3><i class="fas fa-clock"></i> Clock Synchronization</h3></div>
      <div class="card-body">
        <p class="info-text"><i class="fas fa-info-circle"></i> Set the device clock to match the current time of the host PC.</p>
        <div class="button-group"><button class="btn btn-success" :disabled="!deviceStore.connected" @click="handleSyncRtc"><i class="fas fa-arrows-rotate"></i>Sync RTC</button></div>
      </div>
    </div>

    <div class="card fade-in" style="animation-delay:0.2s">
      <div class="card-header"><h3><i class="fas fa-eraser"></i> Delete Records</h3></div>
      <div class="card-body">
        <p class="info-text"><i class="fas fa-info-circle"></i> Delete all log files stored in the device storage. Disconnect and re-connect the device to see the changes.</p>
        <p class="warning-text"><i class="fas fa-triangle-exclamation"></i> This operation cannot be undone.</p>
        <div class="button-group">
          <button class="btn btn-danger" :disabled="!deviceStore.connected || !deleteUnlocked" @click="handleDelete"><i class="fas fa-trash"></i>Delete</button>
          <button class="btn btn-ghost" :disabled="!deviceStore.connected" @click="deleteUnlocked = !deleteUnlocked"><i :class="deleteUnlocked ? 'fas fa-lock-open' : 'fas fa-lock'"></i>{{ deleteUnlocked ? 'Lock' : 'Unlock' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.device-config { display: flex; flex-direction: column; gap: 1.5rem; max-width: 600px; }
.button-group { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1rem; }
.info-text { font-size: 0.875rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 0.5rem; }
.info-text i { margin-right: 0.5rem; color: var(--accent-primary); }
.warning-text { font-size: 0.875rem; color: var(--accent-warning); line-height: 1.6; }
.warning-text i { margin-right: 0.5rem; }
</style>
