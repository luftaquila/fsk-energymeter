<script setup>
import { ref, onMounted, onUnmounted } from "vue";

const isOpen = ref(false);
const menuRef = ref(null);

function toggleMenu() {
  isOpen.value = !isOpen.value;
}

function handleClickOutside(event) {
  if (menuRef.value && !menuRef.value.contains(event.target)) {
    isOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});
</script>

<template>
  <div class="nav-menu" ref="menuRef">
    <button class="menu-btn" @click="toggleMenu" title="Menu">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>

    <div class="dropdown" :class="{ open: isOpen }">
      <div class="dropdown-content">
        <div class="dropdown-section">
          <div class="dropdown-header">Links</div>
          <a href="https://dnf.luftaquila.io" target="_blank" class="dropdown-item">
            <i class="fas fa-comments"></i>
            DNF Forum
          </a>
          <a href="https://github.com/luftaquila/fsk-energymeter" target="_blank" class="dropdown-item">
            <i class="fab fa-github"></i>
            GitHub
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.nav-menu {
  position: relative;
}

.menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.menu-btn:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: scale(1.05);
}

.menu-btn svg {
  width: 20px;
  height: 20px;
  color: white;
}

.dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 220px;
  background: var(--bg-card);
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border-color);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-10px);
  transition: all 0.2s ease;
  z-index: 1000;
  overflow: hidden;
}

.dropdown.open {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.dropdown-content {
  padding: 0.5rem;
}

.dropdown-section {
  padding: 0.25rem 0;
}

.dropdown-header {
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  border-radius: 8px;
  color: var(--text-primary);
  text-decoration: none;
  font-size: 0.875rem;
  transition: all 0.15s ease;
}

.dropdown-item:hover {
  background: var(--bg-hover);
}

.dropdown-item i {
  width: 18px;
  text-align: center;
  color: var(--text-secondary);
}
</style>
