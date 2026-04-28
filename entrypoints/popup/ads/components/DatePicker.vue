<template>
  <div class="custom-date-picker">
    <button 
      class="date-picker-toggle" 
      @click="toggleCalendar"
    >
      <span class="date-icon">📅</span>
      <span class="date-value">{{ formattedDate }}</span>
      <span class="date-arrow">{{ isOpen ? '▲' : '▼' }}</span>
    </button>
    
    <div v-if="isOpen" class="date-picker-calendar">
      <div class="calendar-header">
        <button class="nav-btn" @click="prevMonth">&lt;</button>
        <span class="month-year">{{ currentMonthYear }}</span>
        <button class="nav-btn" @click="nextMonth">&gt;</button>
      </div>
      
      <div class="calendar-weekdays">
        <div v-for="day in weekdays" :key="day" class="weekday">{{ day }}</div>
      </div>
      
      <div class="calendar-days">
        <div 
          v-for="(day, index) in calendarDays" 
          :key="index"
          class="day"
          :class="{ 
            'other-month': !day.isCurrentMonth,
            'today': day.isToday,
            'selected': day.dateStr === modelValue,
            'disabled': !day.isCurrentMonth
          }"
          @click="selectDate(day)"
        >
          {{ day.day }}
        </div>
      </div>
      
      <div class="calendar-footer">
        <button class="today-btn" @click="selectToday">今天</button>
        <button class="clear-btn" @click="clearDate">清空</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'change', value: string): void;
}>();

const isOpen = ref(false);
const currentDate = ref(new Date());

const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

const currentMonthYear = computed(() => {
  const year = currentDate.value.getFullYear();
  const month = currentDate.value.getMonth() + 1;
  return `${year}年${month}月`;
});

const calendarDays = computed(() => {
  const year = currentDate.value.getFullYear();
  const month = currentDate.value.getMonth();
  
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  const days: Array<{
    day: number;
    dateStr: string;
    isCurrentMonth: boolean;
    isToday: boolean;
  }> = [];
  
  // 上月填充
  const startDay = firstDay.getDay();
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDay - 1; i >= 0; i--) {
    const day = prevMonthLastDay - i;
    const date = new Date(year, month - 1, day);
    days.push({
      day,
      dateStr: date.toISOString().split('T')[0],
      isCurrentMonth: false,
      isToday: false
    });
  }
  
  // 本月
  const today = new Date().toISOString().split('T')[0];
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const date = new Date(year, month, i);
    const dateStr = date.toISOString().split('T')[0];
    days.push({
      day: i,
      dateStr,
      isCurrentMonth: true,
      isToday: dateStr === today
    });
  }
  
  // 下月填充
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    const date = new Date(year, month + 1, i);
    days.push({
      day: i,
      dateStr: date.toISOString().split('T')[0],
      isCurrentMonth: false,
      isToday: false
    });
  }
  
  return days;
});

const formattedDate = computed(() => {
  if (!props.modelValue) return '选择日期';
  const date = new Date(props.modelValue);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}年${month}月${day}日`;
});

const toggleCalendar = () => {
  isOpen.value = !isOpen.value;
};

const prevMonth = () => {
  const date = new Date(currentDate.value);
  date.setMonth(date.getMonth() - 1);
  currentDate.value = date;
};

const nextMonth = () => {
  const date = new Date(currentDate.value);
  date.setMonth(date.getMonth() + 1);
  currentDate.value = date;
};

const selectDate = (day: { day: number; dateStr: string; isCurrentMonth: boolean }) => {
  if (!day.isCurrentMonth) return;
  emit('update:modelValue', day.dateStr);
  emit('change', day.dateStr);
  isOpen.value = false;
};

const selectToday = () => {
  const today = new Date().toISOString().split('T')[0];
  emit('update:modelValue', today);
  emit('change', today);
  isOpen.value = false;
};

const clearDate = () => {
  emit('update:modelValue', '');
  emit('change', '');
  isOpen.value = false;
};

// 点击外部关闭日历
watch(isOpen, (newVal) => {
  if (newVal) {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.custom-date-picker')) {
        isOpen.value = false;
        document.removeEventListener('click', handleClickOutside);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);
  }
});

// 初始化当前月份为选中日期的月份
watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    currentDate.value = new Date(newVal);
  }
}, { immediate: true });
</script>

<style scoped>
.custom-date-picker {
  position: relative;
  display: inline-block;
}

.date-picker-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: #333;
  min-width: 140px;
  justify-content: space-between;
  transition: all 0.2s ease;
}

.date-picker-toggle:hover {
  border-color: #1890ff;
  box-shadow: 0 0 4px rgba(24, 144, 255, 0.3);
}

.date-icon {
  font-size: 16px;
}

.date-value {
  flex: 1;
  text-align: left;
}

.date-arrow {
  font-size: 12px;
  color: #999;
}

.date-picker-calendar {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 12px;
  z-index: 1000;
  min-width: 240px;
}

.calendar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.nav-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: #f5f5f5;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  color: #666;
  transition: background 0.2s;
}

.nav-btn:hover {
  background: #e0e0e0;
}

.month-year {
  font-weight: 600;
  color: #333;
}

.calendar-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-bottom: 8px;
}

.weekday {
  text-align: center;
  font-size: 12px;
  color: #999;
  padding: 4px 0;
}

.calendar-days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.day {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
  color: #333;
}

.day:hover:not(.disabled) {
  background: #e6f7ff;
  color: #1890ff;
}

.day.other-month {
  color: #ccc;
  cursor: not-allowed;
}

.day.today {
  background: #1890ff;
  color: #fff;
}

.day.selected {
  background: #096dd9;
  color: #fff;
}

.calendar-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}

.today-btn,
.clear-btn {
  padding: 4px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s;
}

.today-btn {
  background: #f5f5f5;
  color: #666;
}

.today-btn:hover {
  background: #e0e0e0;
}

.clear-btn {
  background: #fff;
  color: #1890ff;
  border: 1px solid #1890ff;
}

.clear-btn:hover {
  background: #e6f7ff;
}
</style>
