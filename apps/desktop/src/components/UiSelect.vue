<template>
  <div class="ui-select-wrap">
    <label v-if="label" class="ui-select-label">{{ label }}</label>
    <div class="ui-select-inner">
      <select
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        class="ui-select"
        @change="$emit('update:modelValue', $event.target.value)"
      >
        <option v-if="placeholder" value="" disabled selected>{{ placeholder }}</option>
        <option
          v-for="opt in options"
          :key="opt.value ?? opt"
          :value="opt.value ?? opt"
          :disabled="opt.disabled"
        >
          {{ opt.label ?? opt }}
        </option>
      </select>
      <span class="ui-select-arrow">▾</span>
    </div>
  </div>
</template>

<script setup>
defineProps({
  modelValue: [String, Number],
  options: { type: Array, required: true },
  placeholder: String,
  label: String,
  disabled: Boolean,
});
defineEmits(["update:modelValue"]);
</script>

<style scoped>
.ui-select-wrap { margin-bottom: 16px; }
.ui-select-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 6px;
}
.ui-select-inner {
  position: relative;
}
.ui-select {
  width: 100%;
  padding: 10px 36px 10px 14px;
  border-radius: var(--r-sm, 8px);
  border: 1px solid var(--border);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  transition: border-color 150ms, box-shadow 150ms;
  appearance: none;
  -webkit-appearance: none;
  box-sizing: border-box;
}
.ui-select:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(124, 92, 191, 0.1);
}
.ui-select:disabled { opacity: 0.5; cursor: not-allowed; }
.ui-select-arrow {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
  font-size: 16px;
}
</style>