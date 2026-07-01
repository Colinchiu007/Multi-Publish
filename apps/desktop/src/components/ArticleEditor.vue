<template>
  <div class="article-editor">
    <QuillEditor
      v-model:content="content"
      content-type="html"
      :options="editorOptions"
      :style="{ minHeight: height }"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { QuillEditor } from '@vueup/vue-quill'
import '@vueup/vue-quill/dist/vue-quill.snow.css'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  height: {
    type: String,
    default: '400px'
  },
  placeholder: {
    type: String,
    default: '在此编辑文章内容...'
  }
})

const emit = defineEmits(['update:modelValue'])

const content = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const editorOptions = {
  theme: 'snow',
  placeholder: props.placeholder,
  modules: {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['blockquote', 'code-block'],
      [{ align: [] }],
      ['link', 'image'],
      ['clean']
    ]
  }
}
</script>

<style scoped>
.article-editor {
  width: 100%;
}
.article-editor :deep(.ql-editor) {
  min-height: v-bind(height);
  font-size: 15px;
  line-height: 1.8;
}
.article-editor :deep(.ql-toolbar) {
  border-radius: 4px 4px 0 0;
}
.article-editor :deep(.ql-container) {
  border-radius: 0 0 4px 4px;
}
</style>