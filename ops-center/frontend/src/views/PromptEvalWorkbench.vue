<template>
  <div class="prompt-eval-workbench">
    <h2>🧪 提示词评测工作台</h2>
    <p class="muted">运营人员真实生成图片，比对「原文 | 中英提示词 | 生成物 | 评估结果」，驱动提示词优化引擎迭代。</p>

    <el-tabs v-model="tab">
      <!-- ============ 新建评测 ============ -->
      <el-tab-pane label="新建评测" name="create">
        <el-form label-width="160px" style="max-width: 860px">
          <el-form-item label="标题">
            <el-input v-model="form.title" placeholder="如：唐代老妇做饭评测" />
          </el-form-item>
          <el-form-item label="原文文本" required>
            <el-input v-model="form.source_text" type="textarea" :rows="3" placeholder="该文案的原始输入文字" />
          </el-form-item>
          <el-form-item label="文案上下文（可选）">
            <el-input v-model="form.context" type="textarea" :rows="2" placeholder="整个文案上下文" />
          </el-form-item>
          <el-form-item label="优化后提示词（中文）" required>
            <el-input v-model="form.prompt_zh" type="textarea" :rows="4" placeholder="prompt-engine 优化后的中文提示词" />
          </el-form-item>
          <el-form-item v-if="form.prompt_en" label="英文对照">
            <div class="en-prompt">
              <el-tag size="small" type="info">机器翻译</el-tag>
              <span>{{ form.prompt_en }}</span>
            </div>
          </el-form-item>
          <el-form-item label="生成模型">
            <el-select v-model="form.provider" placeholder="选择 provider" style="width: 220px">
              <el-option v-for="p in providerOptions" :key="p.provider + '/' + p.model" :label="`${p.provider} / ${p.model}`" :value="p.provider" />
            </el-select>
            <el-input v-model="form.model" placeholder="model（如 image-01）" style="width: 200px; margin-left: 8px" />
          </el-form-item>
          <el-form-item label="图片数">
            <el-input-number v-model="form.image_count" :min="1" :max="20" />
          </el-form-item>
          <el-form-item label="画幅">
            <el-select v-model="form.aspect_ratio" style="width: 160px">
              <el-option v-for="r in ['1:1','16:9','9:16','3:4','4:3']" :key="r" :label="r" :value="r" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="translating" @click="doTranslate">生成英文对照</el-button>
            <el-button type="success" :loading="running" @click="doCreateRun">生成并评估</el-button>
            <span v-if="!providerConfigured" class="warn-text">未配置可用的图片生成模型，请先在「模型密钥」中配置</span>
          </el-form-item>
        </el-form>
        <el-alert v-if="errorMsg" :title="errorMsg" type="error" show-icon closable @close="errorMsg=''" />
      </el-tab-pane>

      <!-- ============ 评测列表/详情 ============ -->
      <el-tab-pane label="评测列表" name="list">
        <el-button size="small" @click="loadCases">刷新</el-button>
        <el-table :data="cases" stripe style="margin-top: 8px">
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column prop="title" label="标题" min-width="160" />
          <el-table-column prop="provider" label="Provider" width="120" />
          <el-table-column prop="model" label="模型" width="120" />
          <el-table-column prop="created_by" label="创建人" width="100" />
          <el-table-column prop="created_at" label="时间" width="180" />
          <el-table-column label="操作" width="160">
            <template #default="{ row }">
              <el-button size="small" @click="openCase(row.id)">详情</el-button>
              <el-button size="small" type="danger" @click="doDelete(row.id)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-drawer v-model="drawerVisible" size="70%" :title="`评测详情 #${detail?.case?.id}`">
          <div v-if="detail" class="case-detail">
            <div class="four-col">
              <div class="col">
                <h4>原文</h4>
                <pre>{{ detail.case.source_text }}</pre>
                <h4>上下文</h4>
                <pre>{{ detail.case.context || '（未提供）' }}</pre>
              </div>
              <div class="col">
                <h4>优化后提示词（中文）</h4>
                <pre>{{ detail.case.prompt_zh }}</pre>
                <h4>英文对照 <el-tag size="small" type="info">机器翻译</el-tag></h4>
                <pre>{{ detail.case.prompt_en || '（未生成）' }}</pre>
              </div>
              <div class="col">
                <h4>生成物</h4>
                <div v-for="(img, i) in currentRun?.image_paths || []" :key="i" class="thumb">
                  <img :src="mediaUrl(img)" :alt="'图片' + i" />
                </div>
                <div v-if="!currentRun" class="muted">尚未生成</div>
              </div>
              <div class="col">
                <h4>评估结果</h4>
                <template v-if="currentRun && currentRun.eval_status === 'succeeded'">
                  <div class="score-big">{{ currentRun.overall_score }}</div>
                  <div class="grade">{{ gradeLabel(currentRun.grade) }}</div>
                  <div v-for="d in currentRun.dimensions || []" :key="d.id" class="dim-row">
                    <span class="dim-label">{{ d.id }}</span>
                    <el-progress :percentage="d.score" :stroke-width="10" style="width: 120px" />
                  </div>
                  <div v-if="(currentRun.problems || []).length" class="problems">
                    <h5>问题</h5>
                    <div v-for="(p, i) in currentRun.problems" :key="i" class="problem">[{{ p.severity }}] {{ p.category }}：{{ p.description }}</div>
                  </div>
                  <div v-if="(currentRun.optimization_points || []).length" class="points">
                    <h5>提示词优化点</h5>
                    <div v-for="(pt, i) in currentRun.optimization_points" :key="i" class="point">[{{ pt.type }}] {{ pt.suggestion }}</div>
                  </div>
                </template>
                <template v-else-if="currentRun && currentRun.status === 'failed'">
                  <el-alert :title="'生成失败：' + (currentRun.error || '')" type="error" :closable="false" />
                </template>
                <template v-else-if="currentRun && currentRun.eval_status === 'failed'">
                  <el-alert :title="'评估失败：' + (currentRun.error || '')" type="warning" :closable="false" />
                </template>
                <template v-else>
                  <el-tag>{{ currentRun ? statusText(currentRun) : '（无 run）' }}</el-tag>
                  <el-button v-if="currentRun && (currentRun.status === 'processing' || currentRun.eval_status === 'evaluating')" size="small" @click="pollRun()">刷新状态</el-button>
                </template>
              </div>
            </div>
            <div class="runs-bar">
              <h4>多次生成对比</h4>
              <el-button v-for="r in detail.runs" :key="r.id" size="small" :type="currentRunId === r.id ? 'primary' : 'default'" @click="selectRun(r.id)">
                run #{{ r.id }}（{{ r.status }} / {{ r.eval_status }}，{{ r.overall_score ?? '-' }}）
              </el-button>
            </div>
          </div>
        </el-drawer>
      </el-tab-pane>

      <!-- ============ 聚合分析 ============ -->
      <el-tab-pane label="聚合分析" name="summary">
        <el-button size="small" @click="loadSummary">刷新</el-button>
        <template v-if="stats">
          <div class="stat-cards">
            <el-card shadow="never" class="stat-card"><div class="stat-num">{{ stats.recordCount }}</div><div class="muted">评估记录</div></el-card>
            <el-card shadow="never" class="stat-card"><div class="stat-num">{{ stats.averageOverall }}</div><div class="muted">平均分</div></el-card>
          </div>
          <h4>等级分布</h4>
          <pre>{{ JSON.stringify(stats.gradeDistribution, null, 2) }}</pre>
          <h4>维度均值</h4>
          <div v-for="d in stats.dimensionAverages" :key="d.id" class="dim-row">
            <span class="dim-label">{{ d.id }}</span>
            <el-progress :percentage="d.average" :stroke-width="10" style="width: 200px" />
          </div>
          <h4>问题类别分布</h4>
          <div v-for="c in stats.problemCategories" :key="c.category" class="cat-line">{{ c.category }}：{{ c.count }} 次</div>
          <h4>优化点汇总</h4>
          <div v-for="pt in stats.optimizationPoints" :key="pt.type" class="cat-line">{{ pt.type }}：{{ pt.count }} 次</div>
          <h4>按 Provider/模型 对比</h4>
          <div v-for="p in stats.providerComparison" :key="p.provider" class="cat-line">{{ p.provider }}：平均 {{ p.average }}（{{ p.count }} 条）</div>
        </template>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  createPromptEvalCase, translatePromptEvalCase, createPromptEvalRun,
  listPromptEvalCases, getPromptEvalCase, deletePromptEvalCase, getPromptEvalSummary,
  listPromptEvalProviders, getPromptEvalRun, mediaUrl,
} from '../api/promptEval'

const tab = ref('create')
const form = ref({ title: '', source_text: '', context: '', prompt_zh: '', prompt_en: '', provider: 'minimax-image', model: 'image-01', image_count: 1, aspect_ratio: '1:1' })
const providerOptions = ref([])
const providerConfigured = computed(() => providerOptions.value.length > 0)
const translating = ref(false)
const running = ref(false)
const errorMsg = ref('')
const cases = ref([])
const detail = ref(null)
const drawerVisible = ref(false)
const currentRunId = ref(null)
const currentRun = computed(() => detail.value?.runs?.find(r => r.id === currentRunId.value) || detail.value?.runs?.[0])
const stats = ref(null)

const GRADE_LABELS = { excellent: '优秀', good: '良好', fair: '一般', poor: '差' }
const gradeLabel = g => GRADE_LABELS[g] || g
const statusText = r => (r.eval_status === 'succeeded' ? '评估完成' : r.status === 'processing' ? '生成中' : r.eval_status === 'evaluating' ? '评估中' : r.status)

async function loadProviders() {
  try {
    const data = await listPromptEvalProviders()
    providerOptions.value = data.items || []
  } catch (e) {
    providerOptions.value = []
  }
}

async function ensureCase() {
  if (form.value.id) return form.value.id
  const payload = {
    title: form.value.title, source_text: form.value.source_text,
    context: form.value.context || undefined, prompt_zh: form.value.prompt_zh,
    provider: form.value.provider, model: form.value.model,
    image_count: form.value.image_count, aspect_ratio: form.value.aspect_ratio,
  }
  const created = await createPromptEvalCase(payload)
  form.value.id = created.id
  return created.id
}

async function doTranslate() {
  errorMsg.value = ''
  translating.value = true
  try {
    const cid = await ensureCase()
    const updated = await translatePromptEvalCase(cid)
    form.value.prompt_en = updated.prompt_en
  } catch (e) {
    errorMsg.value = '翻译失败：' + (e?.response?.data?.detail || e.message)
  } finally {
    translating.value = false
  }
}

async function doCreateRun() {
  errorMsg.value = ''
  running.value = true
  try {
    const cid = await ensureCase()
    await createPromptEvalRun(cid)
    tab.value = 'list'
    await loadCases()
  } catch (e) {
    errorMsg.value = '启动失败：' + (e?.response?.data?.detail || e.message)
  } finally {
    running.value = false
  }
}

async function loadCases() {
  const data = await listPromptEvalCases()
  cases.value = data.items || []
}

async function openCase(id) {
  detail.value = await getPromptEvalCase(id)
  currentRunId.value = detail.value.runs?.[0]?.id || null
  drawerVisible.value = true
}

function selectRun(id) {
  currentRunId.value = id
}

async function pollRun() {
  if (!currentRunId.value) return
  const run = await getPromptEvalRun(currentRunId.value)
  const idx = detail.value.runs.findIndex(r => r.id === run.id)
  if (idx >= 0) detail.value.runs[idx] = run
}

async function doDelete(id) {
  if (!window.confirm('确认删除该评测及其生成物？')) return
  await deletePromptEvalCase(id)
  await loadCases()
}

async function loadSummary() {
  stats.value = await getPromptEvalSummary()
}

onMounted(async () => {
  await loadProviders()
  await loadCases()
})
</script>

<style scoped>
.muted { color: #909399; font-size: 13px; }
.warn-text { color: #e6a23c; font-size: 13px; margin-left: 8px; }
.en-prompt { display: flex; gap: 8px; align-items: flex-start; }
.four-col { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 16px; }
.col pre { background: #f5f7fa; padding: 8px; border-radius: 6px; white-space: pre-wrap; font-size: 12px; max-height: 220px; overflow: auto; }
.thumb img { width: 100%; border-radius: 6px; border: 1px solid #e4e7ed; margin-bottom: 8px; }
.score-big { font-size: 40px; font-weight: 700; color: #409eff; }
.grade { font-weight: 600; margin-bottom: 8px; }
.dim-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.dim-label { width: 130px; font-size: 12px; }
.problems, .points { margin-top: 10px; }
.problem, .point { font-size: 12px; margin-bottom: 4px; }
.runs-bar { margin-top: 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.stat-cards { display: flex; gap: 12px; margin-bottom: 12px; }
.stat-card { width: 160px; }
.stat-num { font-size: 28px; font-weight: 700; color: #409eff; }
.cat-line { font-size: 13px; padding: 2px 0; }
</style>
