<template>
  <div>
    <div class="cohere-page-header">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%">
        <div>
          <div class="page-title">📅 发布日历</div>
          <div class="page-subtitle">可视化内容排期与发布历史</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="cohere-btn-secondary" @click="prevMonth">◀</button>
          <span style="font-weight:600;font-size:15px;min-width:140px;text-align:center">{{ currentMonthLabel }}</span>
          <button class="cohere-btn-secondary" @click="nextMonth">▶</button>
          <button class="cohere-btn-secondary" @click="today" style="margin-left:8px">今天</button>
        </div>
      </div>
    </div>

    <div class="cohere-content" style="display:flex;gap:var(--space-md)">
      <!-- 日历网格 -->
      <div style="flex:2;min-width:0">
        <div class="calendar-grid">
          <div class="cal-header" v-for="d in dayNames" :key="d">{{ d }}</div>
          <div
            v-for="(day, i) in calendarDays"
            :key="i"
            class="cal-day"
            :class="{
              'other-month': !day.isCurrentMonth,
              'today': day.isToday,
              'selected': selectedDate === day.dateStr,
              'has-event': day.events.length > 0,
            }"
            @click="selectDay(day)"
          >
            <span class="cal-day-num">{{ day.day }}</span>
            <div class="cal-day-events">
              <div
                v-for="e in day.events.slice(0, 3)"
                :key="e.id"
                class="cal-event-dot"
                :class="e.type"
                :title="e.title"
              ></div>
              <span v-if="day.events.length > 3" class="cal-event-more">+{{ day.events.length - 3 }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 详情面板 -->
      <div style="flex:1;min-width:280px">
        <div class="cohere-card" style="cursor:default;padding:16px">
          <div style="font-weight:600;font-size:14px;margin-bottom:var(--space-md)">
            {{ selectedDateLabel || '选择日期查看详情' }}
          </div>

          <div v-if="!selectedDayEvents || selectedDayEvents.length === 0" style="text-align:center;padding:20px;color:var(--muted);font-size:13px">
            该日期暂无发布记录
          </div>

          <div v-else class="day-events">
            <div v-for="e in selectedDayEvents" :key="e.id" class="day-event-item" :class="e.type">
              <div class="event-time">{{ formatEventTime(e) }}</div>
              <div class="event-content">
                <span class="event-status">{{ e.type === 'scheduled' ? '⏰' : e.success !== false ? '✅' : '❌' }}</span>
                <span class="event-title">{{ e.title || e.article?.title || '(无标题)' }}</span>
              </div>
              <div class="event-platform">{{ e.platform }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue"
import { usePlatformStore } from "@/stores/platforms"

const platformStore = usePlatformStore()
platformStore.load()
function platformName(id) { return platformStore.getLabel(id) || id }

const now = new Date()
const currentYear = ref(now.getFullYear())
const currentMonth = ref(now.getMonth())
const selectedDate = ref(null)
const scheduledTasks = ref([])
const publishHistory = ref([])
const loading = ref(false)

const dayNames = ["日", "一", "二", "三", "四", "五", "六"]

const currentMonthLabel = computed(() => {
  return currentYear.value + " 年 " + (currentMonth.value + 1) + " 月"
})

const calendarDays = computed(() => {
  const year = currentYear.value
  const month = currentMonth.value
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev = new Date(year, month, 0).getDate()
  const todayStr = new Date().toISOString().slice(0, 10)

  const days = []

  // Previous month days
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrev - i
    const dateStr = new Date(year, month - 1, d).toISOString().slice(0, 10)
    days.push({ day: d, dateStr, isCurrentMonth: false, isToday: dateStr === todayStr, events: getEventsForDate(dateStr) })
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = new Date(year, month, d).toISOString().slice(0, 10)
    days.push({ day: d, dateStr, isCurrentMonth: true, isToday: dateStr === todayStr, events: getEventsForDate(dateStr) })
  }

  // Next month days to fill grid
  const remaining = 42 - days.length
  for (let d = 1; d <= remaining; d++) {
    const dateStr = new Date(year, month + 1, d).toISOString().slice(0, 10)
    days.push({ day: d, dateStr, isCurrentMonth: false, isToday: dateStr === todayStr, events: getEventsForDate(dateStr) })
  }

  return days
})

const selectedDayEvents = computed(() => {
  if (!selectedDate.value) return []
  return getEventsForDate(selectedDate.value)
})

const selectedDateLabel = computed(() => {
  if (!selectedDate.value) return ""
  return selectedDate.value.replace(/-/g, "/")
})

function getEventsForDate(dateStr) {
  const events = []
  // Add scheduled tasks
  for (const t of scheduledTasks.value) {
    if (t.publishTime && t.publishTime.slice(0, 10) === dateStr) {
      events.push({ ...t, type: "scheduled" })
    }
  }
  // Add history
  for (const r of publishHistory.value) {
    if (r.timestamp && r.timestamp.slice(0, 10) === dateStr) {
      events.push({ ...r, type: r.success !== false ? "success" : "failed" })
    }
  }
  return events.sort((a, b) => ((a.publishTime || a.timestamp) > (b.publishTime || b.timestamp) ? 1 : -1))
}

function formatEventTime(e) {
  const t = e.publishTime || e.timestamp
  if (!t) return ""
  return t.slice(11, 16)
}

function selectDay(day) {
  selectedDate.value = day.dateStr
}

function prevMonth() {
  if (currentMonth.value === 0) {
    currentMonth.value = 11
    currentYear.value--
  } else {
    currentMonth.value--
  }
}

function nextMonth() {
  if (currentMonth.value === 11) {
    currentMonth.value = 0
    currentYear.value++
  } else {
    currentMonth.value++
  }
}

function today() {
  const t = new Date()
  currentYear.value = t.getFullYear()
  currentMonth.value = t.getMonth()
  selectedDate.value = t.toISOString().slice(0, 10)
}

async function loadData() {
  loading.value = true
  const api = window.electronAPI
  try {
    if (api) {
      if (api.schedulerList) {
        const sRes = await api.schedulerList()
        if (sRes && sRes.code === 0) scheduledTasks.value = sRes.data || []
      }
      if (api.historyList) {
        const hRes = await api.historyList({ limit: 500 })
        if (hRes && hRes.code === 0) publishHistory.value = (hRes.data && hRes.data.records) || []
      }
    }
  } catch (e) { /* ignore */ }
  finally { loading.value = false }
}

onMounted(() => {
  loadData()
  selectedDate.value = new Date().toISOString().slice(0, 10)
})
</script>

<style scoped>
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}
.cal-header {
  padding: 10px 4px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  background: var(--soft-stone, #f8f8f8);
  border-bottom: 1px solid var(--border);
}
.cal-day {
  min-height: 80px;
  padding: 6px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  position: relative;
  transition: background 0.1s;
}
.cal-day:nth-child(7n) { border-right: none; }
.cal-day:hover { background: var(--soft-stone, #f5f5f5); }
.cal-day.other-month { opacity: 0.3; }
.cal-day.today .cal-day-num {
  background: var(--coral, #f56c6c);
  color: #fff;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cal-day.selected { background: #fef2f2; }
.cal-day.has-event .cal-day-num::after {
  content: "";
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--coral);
}
.cal-day-num {
  font-size: 13px;
  font-weight: 500;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.cal-day-events {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  margin-top: 4px;
  padding: 0 2px;
}
.cal-event-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.cal-event-dot.scheduled { background: #fbbf24; }
.cal-event-dot.success { background: #34d399; }
.cal-event-dot.failed { background: #f87171; }
.cal-event-more {
  font-size: 9px;
  color: var(--muted);
}
.day-events {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.day-event-item {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
}
.day-event-item.scheduled { border-left: 3px solid #fbbf24; }
.day-event-item.success { border-left: 3px solid #34d399; }
.day-event-item.failed { border-left: 3px solid #f87171; }
.event-time {
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 2px;
}
.event-content {
  display: flex;
  align-items: center;
  gap: 4px;
}
.event-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.event-platform {
  font-size: 11px;
  color: var(--muted);
  margin-top: 2px;
}
</style>
