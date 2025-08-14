<template>
    <CardContainer class="">
        <template #header>
            <div class="flex flex-row text-center justify-center">
                {{ title }}
            </div>
        </template>

        <div class="grid grid-cols-1 gap-2">
            <div class="border border-default rounded-md p-2 min-w-[600px] w-full max-w-[600px] mx-auto">
                <label for="frequency-select" class="block text-sm font-medium">Backup Frequency</label>
                <select id="frequency-select" v-model="schedule.repeatFrequency" class="input-textlike w-full">
                    <option value="hour">Hourly</option>
                    <option value="day">Daily</option>
                    <option value="week">Weekly</option>
                    <option value="month">Monthly</option>
                </select>

                <div class="col-span-1 grid grid-cols-1 gap-2 mt-2">
                    <!-- Day Input -->
                    <div>
                        <label class="block text-sm">Start Day</label>
                        <input type="number" v-model="dayValue" @input="updateStartDate" min="1" max="31"
                            class="input-textlike w-full" />
                    </div>
                    <!-- Month Input -->
                    <div>
                        <label class="block text-sm">Start Month</label>
                        <input type="number" v-model="monthValue" @input="updateStartDate" min="1" max="12"
                            class="input-textlike w-full" />
                    </div>
                </div>
            </div>

            <div :title="parsedIntervalString"
                class="col-span-1 mt-2 text-base text-default bg-well p-2 rounded-md text-center w-full max-w-[600px] mx-auto">
                <p><strong>Preview:</strong> </p>
                <p><i>{{ parsedIntervalString }}</i></p>
            </div>

            <div class="border border-default rounded-md p-2 ">
                <div class="text-center">
                    <div class="flex justify-between w-full mb-4">
                        <button @click="changeMonth(-1)" class="btn btn-secondary">
                            Prev
                        </button>
                        <span class="text-lg font-semibold text-default mt-2">{{ monthNames[currentMonth] }} {{
                            currentYear
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
                    <div class="grid grid-cols-7 gap-1 w-full grid-rows-6 auto-rows-fr">
                        <div v-for="day in days" :key="day.id"
                            :class="{ 'bg-accent text-muted border-default': day.isPadding, 'bg-green-600 dark:bg-green-800': day.isMarked && !day.isPadding, 'bg-default': !day.isMarked && !day.isPadding }"
                            class="p-2 text-default text-center border border-default rounded">
                            {{ day.date }}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <template #footer>
            <div class="button-group-row w-full justify-between">
                <button @click.stop="emit('close')" class="btn btn-danger">Close</button>
                <button :disabled="savingSchedule" @click="saveScheduleBtn()" class="btn btn-primary">
                    {{ savingSchedule ? 'Saving...' : 'Save Schedule' }}
                </button>
            </div>
        </template>
    </CardContainer>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue';
import { CardContainer } from '..';
import { CommanderToolTip } from '../commander';
import { type TaskSchedule, parseTaskScheduleIntoString } from "@45drives/houston-common-lib";

interface Props {
    title: string;
    taskSchedule: TaskSchedule;
}
const props = defineProps<Props>();
const emit = defineEmits(['close', 'save']);

const savingSchedule = ref(false);

// Directly use TaskSchedule instead of Interval
// const schedule = ref<TaskSchedule>({ ...props.taskSchedule });
const schedule = ref<TaskSchedule>(props.taskSchedule || { repeatFrequency: 'day', startDate: new Date() });

// Extract day/month values from startDate
const dayValue = ref(schedule.value.startDate.getDate());
const monthValue = ref(schedule.value.startDate.getMonth() + 1);

// Update startDate when inputs change
const updateStartDate = () => {
    schedule.value.startDate = new Date(schedule.value.startDate.getFullYear(), monthValue.value - 1, dayValue.value);
};

// Calendar logic
const today = new Date();
const currentMonth = ref(today.getMonth());
const currentYear = ref(today.getFullYear());

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const days = computed(() => {
    const firstDayOfMonth = new Date(currentYear.value, currentMonth.value, 1).getDay();
    const numDays = new Date(currentYear.value, currentMonth.value + 1, 0).getDate();

    const daysArray = Array.from({ length: numDays }, (_, i) => {
        const date = new Date(currentYear.value, currentMonth.value, i + 1);
        const id = date.toISOString().split('T')[0];
        return { id, date: i + 1, isMarked: isScheduled(date), isPadding: false };
    });

    const startPaddingDays = Array.from({ length: firstDayOfMonth }, (_, i) => ({
        id: `pad-start-${i}`,
        date: '',
        isMarked: false,
        isPadding: true,
    }));

    const totalCells = 42;
    const endPaddingCount = totalCells - (startPaddingDays.length + daysArray.length);
    const endPaddingDays = Array.from({ length: endPaddingCount }, (_, i) => ({
        id: `pad-end-${i}`,
        date: '',
        isMarked: false,
        isPadding: true,
    }));

    return [...startPaddingDays, ...daysArray, ...endPaddingDays];
});

// Function to check if a date should be marked based on schedule
const isScheduled = (date: Date): boolean => {
    const scheduledDay = schedule.value.startDate.getDate();
    const scheduledMonth = schedule.value.startDate.getMonth();
    const freq = schedule.value.repeatFrequency;

    if (freq === 'hour') return true; // Every hour (all days marked)
    if (freq === 'day') return true; // Daily (all days marked)
    if (freq === 'week') return date.getDay() === schedule.value.startDate.getDay(); // Weekly (same day of week)
    if (freq === 'month') return date.getDate() === scheduledDay; // Monthly (same day of month)

    return false;
};

// Change month in calendar
const changeMonth = (delta: number) => {
    currentMonth.value += delta;
    if (currentMonth.value < 0) {
        currentMonth.value = 11;
        currentYear.value--;
    } else if (currentMonth.value > 11) {
        currentMonth.value = 0;
        currentYear.value++;
    }
};

// Save function
async function saveScheduleBtn() {
    savingSchedule.value = true;
    emit('save', schedule.value);
}


const parsedIntervalString = computed(() => parseTaskScheduleIntoString(schedule.value));
</script>

<style scoped>
.grid-rows-6 {
    grid-template-rows: repeat(6, minmax(0, 1fr));
}
</style>
