<!-- CalendarDisplay.vue -->
<template>
	<div class="text-center">
		<div class="flex justify-between w-full mb-4">
			<button @click="changeMonth(-1)" class="btn btn-secondary">
				Prev
			</button>
			<span class="text-lg font-semibold text-default mt-2">{{ monthNames[currentMonth] }} {{ currentYear
				}}</span>
			<button @click="changeMonth(1)" class="btn btn-secondary">
				Next
			</button>
		</div>
		<div class="grid grid-cols-7 w-full mb-2">
			<div v-for="day in weekDays" :key="day" class="text-center text-default font-medium">
				{{ day }}
			</div>
		</div>
		<div class="grid grid-cols-7 gap-2 w-full grid-rows-6">
			<div v-for="day in days" :key="day.id"
				:class="{ 'bg-accent text-muted border-default': day.isPadding, 'bg-green-600 dark:bg-green-800': day.isMarked && !day.isPadding, 'bg-default': !day.isMarked && !day.isPadding }"
				class="p-2 text-default text-center border border-default rounded">
				{{ day.date }}
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { type Interval, convertDayOfWeekToCron, validateCronField } from  "@45drives/houston-common-lib";

interface Props {
  interval: Interval;
}
const props = defineProps<Props>();

const today = new Date();
const currentMonth = ref(today.getMonth());
const currentYear = ref(today.getFullYear());

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const days = computed(() => {
	const firstDayOfMonth = new Date(currentYear.value, currentMonth.value, 1).getDay();
	const numDays = new Date(currentYear.value, currentMonth.value + 1, 0).getDate();

	// Generate the real days
	const daysArray = Array.from({ length: numDays }, (_, i) => {
		const date = new Date(currentYear.value, currentMonth.value, i + 1);
		const id = date.toISOString().split('T')[0];
		const isMarked = checkSchedule(date, props.interval);
		return { id, date: i + 1, isMarked, isPadding: false };
	});

	// Generate padding before the first day
	const startPaddingDays = Array.from({ length: firstDayOfMonth }, (_, i) => ({
		id: `pad-start-${i}`,
		date: '',
		isMarked: false,
		isPadding: true,
	}));

	// Compute the total number of slots needed to fill 6 rows
	const totalCells = 42;
	const endPaddingCount = totalCells - (startPaddingDays.length + daysArray.length);

	// Generate padding at the end
	const endPaddingDays = Array.from({ length: endPaddingCount }, (_, i) => ({
		id: `pad-end-${i}`,
		date: '',
		isMarked: false,
		isPadding: true,
	}));

	return [...startPaddingDays, ...daysArray, ...endPaddingDays];
});


function checkSchedule(date: Date, interval: Interval): boolean {
	// Validate fields before processing
	if (!validateCronField(interval.day!.value, 'day')) {
		console.warn(`Invalid cron expression for day: ${interval.day!.value}`);
		return false;
	}

	if (!validateCronField(interval.month!.value, 'month')) {
		console.warn(`Invalid cron expression for month: ${interval.month!.value}`);
		return false;
	}
	// const dayOfWeekMap = {
	// 	'Sun': '0', 'Mon': '1', 'Tue': '2', 'Wed': '3', 'Thu': '4', 'Fri': '5', 'Sat': '6',
	// };

	const matches = (value: string, dateComponent: number) => {
		if (value === '*') {
			return true;
		} else if (value.includes('/')) {
			const [base, step] = value.split('/');
			const start = base === '*' ? 0 : parseInt(base);
			const interval = parseInt(step);
			return (dateComponent - start) % interval === 0;
		} else if (value.includes('-')) {
			const [start, end] = value.split('-').map(Number);
			return dateComponent >= start && dateComponent <= end;
		} else if (value.includes('..')) {
			const [start, end] = value.split('..').map(Number);
			return dateComponent >= start && dateComponent <= end;
		} else if (value.includes(',')) {
			const values = value.split(',').map(Number);
			return values.includes(dateComponent);
		} else {
			return parseInt(value) === dateComponent;
		}
	};

	// if (interval.dayOfWeek && interval.dayOfWeek.length > 0 && !interval.dayOfWeek.some(day => matches(dayOfWeekMap[day], date.getDay()))) {
	// 	return false;
	// }
	if (interval.dayOfWeek && interval.dayOfWeek.length > 0) {
		const cronDays = interval.dayOfWeek.map(convertDayOfWeekToCron);
		if (!cronDays.includes(date.getDay().toString())) return false;
	}

	// if (interval.year && !matches(interval.year.value.toString(), date.getFullYear())) {
	// 	return false;
	// }
	// if (interval.month && !matches(interval.month.value.toString(), date.getMonth() + 1)) {
	// 	return false;
	// }
	// if (interval.day && !matches(interval.day.value.toString(), date.getDate())) {
	// 	return false;
	// }
	return matches(interval.day!.value, date.getDate()) &&
		matches(interval.month!.value, date.getMonth() + 1);

	// return true;
}


function changeMonth(delta: number) {
  currentMonth.value += delta;
  if (currentMonth.value < 0) {
	currentMonth.value = 11;
	currentYear.value--;
  } else if (currentMonth.value > 11) {
	currentMonth.value = 0;
	currentYear.value++;
  }
}
</script>

<style scoped>
.grid-rows-6 {
	grid-template-rows: repeat(6, minmax(0, 1fr));
	/* Ensures consistent row height */
}

.p-2 {
	min-height: 2.5rem;
	/* Adjust height for consistent spacing */
}
</style>

