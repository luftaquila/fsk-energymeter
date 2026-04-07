<script setup>
import { useRoute } from "vue-router";

const route = useRoute();

const navItems = [
  { id: "viewer", label: "Data Viewer", path: "/", icon: "fa-chart-line" },
  { id: "config", label: "Device Config", path: "/config", icon: "fa-gear" },
];
</script>

<template>
  <nav class="nav-tabs">
    <router-link
      v-for="item in navItems"
      :key="item.id"
      :to="item.path"
      class="nav-tab"
      :class="{ active: route.path === item.path }"
    >
      <i :class="['fas', item.icon]"></i>
      {{ item.label }}
    </router-link>
  </nav>
</template>

<style scoped>
.nav-tabs {
  display: flex;
  gap: 0.5rem;
  flex: 1;
  justify-content: center;
}

.nav-tab {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  border-radius: 8px;
  color: #b0b4be;
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
  transition: background-color 0.15s ease, color 0.15s ease;
  background: rgba(255, 255, 255, 0.05);
}

.nav-tab:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #e2e4e9;
}

.nav-tab.active {
  background: rgba(255, 255, 255, 0.12);
  color: #e2e4e9;
}

.nav-tab i {
  font-size: 0.875rem;
}

@media (max-width: 640px) {
  .nav-tabs {
    order: 3;
    flex: 0 0 100%;
    justify-content: center;
  }

  .nav-tab {
    flex: 1;
    justify-content: center;
    padding: 0.5rem 1rem;
    font-size: 0.8rem;
  }
}
</style>
