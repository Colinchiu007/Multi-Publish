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
.ui-input {
  width: 100%;
  padding: var(--apple-space-2) var(--apple-space-3);
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-sm);
  font-family: var(--apple-font-text);
  font-size: var(--apple-size-sm);
  color: var(--apple-ink-primary);
  background: var(--apple-surface-primary);
  transition: border-color var(--apple-duration-fast) var(--apple-ease-default),
              box-shadow var(--apple-duration-fast) var(--apple-ease-default);
  outline: none;
}
.ui-input::placeholder {
  color: var(--apple-ink-tertiary);
}
.ui-input:focus {
  border-color: var(--apple-accent);
  box-shadow: 0 0 0 2px var(--apple-info-bg);
}
.ui-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--apple-surface-secondary);
}
</style>