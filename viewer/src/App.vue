<script setup>
import ThemeToggle from "./components/ThemeToggle.vue";
import NavTabs from "./components/NavTabs.vue";
import NavMenu from "./components/NavMenu.vue";
</script>

<template>
  <div class="app-container">
    <header class="header">
      <div class="header-content">
        <a href="/" class="logo">
          <span class="logo-icon">💡</span>
          <h1>FSK Energy Meter</h1>
        </a>
        <NavTabs />
        <div class="header-actions">
          <ThemeToggle />
          <NavMenu />
        </div>
      </div>
    </header>

    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh;
  background: var(--bg-primary);
}

.header {
  background: #1a1b21;
  padding: 1rem 2rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.header-content {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 2rem;
}

.logo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
  text-decoration: none;
}

.logo-icon {
  font-size: 2rem;
}

.logo h1 {
  color: #e2e4e9;
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.02em;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-shrink: 0;
}

.main-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1.5rem 2rem;
}

@media (max-width: 640px) {
  .header {
    padding: 0.75rem 1rem;
  }

  .header-content {
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .logo-icon {
    font-size: 1.5rem;
  }

  .logo h1 {
    font-size: 1.05rem;
  }

  .main-content {
    padding: 1rem;
  }
}
</style>
