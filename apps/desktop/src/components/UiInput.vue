<template>
  <div class="ui-input-wrap">
    <label v-if="label" class="ui-input-label">{{ label }}</label>
    <input
      v-if="type !== 'textarea'"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      class="ui-input"
      @input="$emit('update:modelValue', $event.target.value)"
      @focus="$emit('focus', $event)"
      @blur="$emit('blur', $event)"
    />
    <textarea
      v-else
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :rows="rows"
      class="ui-input ui-textarea"
      @input="$emit('update:modelValue', $event.target.value)"
    ></textarea>
    <p v-if="hint" class="ui-input-hint">{{ hint }}</p>
  </div>
</template>

<script setup>
defineProps({
  modelValue: [String, Number],
  label: String,
  type: { type: String, default: "text" },
  placeholder: String,
  hint: String,
  disabled: Boolean,
  rows: { type: Number, default: 4 },
});
defineEmits(["update:modelValue", "focus", "blur"]);
</script>

<style scoped>
.ui-input-wrap { margin-bottom: 16px; }
.ui-input-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 6px;
}
.ui-input {
  width: 100%;
  padding: 10px 14px;
  border-radius: var(--r-sm, 8px);
  border: 1px solid var(--border);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  background: var(--surface);
  color: var(--text);
  transition: border-color 150ms, box-shadow 150ms;
  box-sizing: border-box;
}
.ui-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(124, 92, 191, 0.1);
}
.ui-input::placeholder { color: var(--text-light); }
.ui-textarea { resize: vertical; line-height: 1.6; min-height: 80px; }
.ui-input-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}
</style>