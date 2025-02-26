<!-- CalendarConfig.vue -->
<template>
    <CardContainer>
        <template #header>
            <div class="flex flex-row text-center justify-center">
                {{ title }}
            </div>
        </template>
        <div class="grid grid-cols-2 gap-2">
            <!-- Left side: Interval configuration -->
            <div class="border border-default p-2">
                <p class="block text-base">
                    
                </p>

                <label for="preset-select" class="block text-sm font-medium">Interval Preset</label>
                <select id="preset-select" v-model="selectedPreset" class="input-textlike w-full">
                    <option value="none">None</option>
                    <option value="minutely">Minutely</option>
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                </select>
                <div name="schedule-fields" class="col-span-1 grid grid-cols-2 gap-2 mt-2">
                    <div name="hour">
                        <div class="flex flex-row justify-between items-center">
                            <div class="flex flex-row justify-between items-center">
                                <label class="block text-sm leading-6 text-default mr-2">Hour</label>
                                <CommanderToolTip :width="700"
                                    :message="'Use * for Every Value, \n*/N for Every Nth Value, \nCommas to specify separate values, \nHyphen to specify a range of values.'" />
                            </div>
                            <ExclamationCircleIcon v-if="hourErrorTag" class="mt-1 w-5 h-5 text-danger" />
                        </div>
                        <input @click.stop v-model="interval.hour!.value" type="text" placeholder="(0-23)" :class="[
                            'my-1 block w-full text-default input-textlike bg-default',
                            hourErrorTag ? 'outline outline-1 outline-rose-500 dark:outline-rose-700' : ''
                        ]"
                            title="Use asterisk (*) for all values, hyphen (-) for ranges (eg. 2-7), and commas for lists (eg. 2,4,7)" />
                    </div>
                    <div name="minute">
                        <div class="flex flex-row justify-between items-center">
                            <div class="flex flex-row justify-between items-center">
                                <label class="block text-sm leading-6 text-default mr-2">Minute</label>
                                <CommanderToolTip :width="700"
                                    :message="'Use * for Every Value, \n*/N for Every Nth Value, \nCommas to specify separate values, \nHyphen to specify a range of values.'" />
                            </div>
                            <ExclamationCircleIcon v-if="minuteErrorTag" class="mt-1 w-5 h-5 text-danger" />
                        </div>
                        <input @click.stop v-model="interval.minute!.value" type="text" placeholder="(0-59)" :class="[
                            'my-1 block w-full text-default input-textlike bg-default',
                            minuteErrorTag ? 'outline outline-1 outline-rose-500 dark:outline-rose-700' : ''
                        ]"
                            title="Use asterisk (*) for all values, hyphen (-) for ranges (eg. 2-7), and commas for lists (eg. 2,4,7)" />
                    </div>

                    <div name="date-data" class="col-span-2 grid grid-cols-3 gap-2">
                        <div name="day">
                            <div class="flex flex-row justify-between items-center">
                                <div class="flex flex-row justify-between items-center">
                                    <label class="block text-sm leading-6 text-default mr-2">Day</label>
                                    <CommanderToolTip :width="700" :message="'Use * for Every Value, \nX/N for Every Nth Value starting on Day X, \nCommas to specify separate values, \nTwo periods to specify a range of values (2..8).'" />
                                </div>
                                <ExclamationCircleIcon v-if="dayErrorTag" class="mt-1 w-5 h-5 text-danger" />
                            </div>
                            <input @click.stop v-model="interval.day!.value" type="text" placeholder="(1-31)" :class="[
                                'my-1 block w-full text-default input-textlike bg-default',
                                dayErrorTag ? 'outline outline-1 outline-rose-500 dark:outline-rose-700' : ''
                            ]"
                                title="Use asterisk (*) for all values, double-periods (..) for ranges (eg. 2..7), and commas for lists (eg. 2,4,7)" />
                        </div>
                        <div name="month">
                            <div class="flex flex-row justify-between items-center">
                                <div class="flex flex-row justify-between items-center">
                                    <label class="block text-sm leading-6 text-default mr-2">Month</label>
                                    <CommanderToolTip :width="700"
                                        :message="'Use * for Every Value, \nCommas to specify separate values, \nTwo periods to specify a range of values(2..8).'" />
                                </div>
                                <ExclamationCircleIcon v-if="monthErrorTag" class="mt-1 w-5 h-5 text-danger" />
                            </div>
                            <input @click.stop v-model="interval.month!.value" type="text" placeholder="(1-12)" :class="[
                                    'my-1 block w-full text-default input-textlike bg-default',
                                    monthErrorTag ? 'outline outline-1 outline-rose-500 dark:outline-rose-700' : ''
                                ]"
                                title="Use asterisk (*) for all values, double-periods (..) for ranges (eg. 2..7), and commas for lists (eg. 2,4,7)" />
                        </div>
                        <div name="year">
                            <div class="flex flex-row justify-between items-center">
                                <div class="flex flex-row justify-between items-center">
                                    <label class="block text-sm leading-6 text-default mr-2">Year</label>
                                    <CommanderToolTip :width="700"
                                        :message="'Use * for Every Value, \nCommas to specify separate values, \nTwo periods to specify a range of values (2..8).'" />
                                </div>
                                <ExclamationCircleIcon v-if="yearErrorTag" class="mt-1 w-5 h-5 text-danger" />
                            </div>
                            <input @click.stop v-model="interval.year!.value" type="text" placeholder="(YYYY)" :class="[
                                    'my-1 block w-full text-default input-textlike bg-default',
                                    yearErrorTag ? 'outline outline-1 outline-rose-500 dark:outline-rose-700' : ''
                                ]"
                                title="Use asterisk (*) for all values, double-periods (..) for ranges (eg. 2..7), and commas for lists (eg. 2,4,7)" />
                        </div>
                    </div>

                    <div name="dayOfWeek" class="col-span-2">
                        <label class="block text-sm leading-6 text-default mr-2">Day of Week</label>
                        <table class="w-full">
                            <tr class="grid grid-cols-7">
                                <td v-for="day in daysOfWeek" class="px-0.5 col-span-1">
                                    <button @click.stop
                                        class="flex items-center w-full h-full border border-default rounded-lg bg-default"
                                        :class="daySelectedClass(day)">
                                        <label :for="`${day}`"
                                            class="flex flex-col items-center whitespace-nowrap w-full p-1 px-1 text-sm gap-0.5 bg-default rounded-lg"
                                            :class="daySelectedClass(day)">
                                            <p class="w-full mt-0.5 text-sm text-default">{{ day }}</p>
                                            <input @click.stop :id="`${day}`" v-model="interval.dayOfWeek"
                                                type="checkbox" :value="`${day}`" :name="`${day}`"
                                                class="mb-0.5 w-4 h-4 text-success bg-well border-default rounded focus:ring-green-500 dark:focus:ring-green-600 dark:ring-offset-gray-800 focus:ring-2" />
                                        </label>
                                    </button>
                                </td>
                            </tr>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Right side: Calendar preview -->
            <div class="border border-default p-2">
                <CalendarDisplay :interval="interval" />
                <div class="mt-2 text-sm text-muted bg-header p-2 rounded-md">
                    <!-- Optionally, display the parsed interval string -->
                    <strong>Preview:</strong> {{ parsedInterval }}
                </div>
            </div>
        </div>
        <template #footer>
            <div class="w-full">
                <div class="button-group-row w-full justify-between">
                    <div class="button-group-row">
                        <button @click.stop="$emit('close')" id="close-add-schedule-btn" name="close-add-schedule-btn"
                            class="btn btn-danger h-fit w-full">Close</button>
                    </div>
                    <!-- <div class="button-group-row">
                        <button disabled v-if="savingSchedule && hasIntervals" id="adding-schedule-btn" type="button"
                            class="btn btn-primary h-fit w-full">
                            <svg aria-hidden="true" role="status"
                                class="inline w-4 h-4 mr-3 text-gray-200 animate-spin text-default"
                                viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path
                                    d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
                                    fill="currentColor" />
                                <path
                                    d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
                                    fill="text-success" />
                            </svg>
                            Saving Schedule...
                        </button>
                        <button disabled v-if="!savingSchedule && !hasIntervals" id="add-schedule-btn" type="button"
                            class="btn btn-primary h-fit w-full" @click="saveScheduleBtn()">Save Schedule</button>
                        <button v-if="!savingSchedule && hasIntervals" id="add-schedule-btn" type="button"
                            class="btn btn-primary h-fit w-full" @click="saveScheduleBtn()">Save Schedule</button>
                    </div> -->
                </div>
            </div>
        </template>
    </CardContainer>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue';
import { ExclamationCircleIcon } from '@heroicons/vue/24/outline';
import { CardContainer } from '..';
import CalendarDisplay from './CalendarDisplay.vue';
import { CommanderToolTip } from '../commander';
import { type Interval, type DayOfWeek, convertToCronSyntax } from  "@45drives/houston-common-lib";

interface Props {
  title: string;
  show: boolean;
  config?: any;
}
const props = defineProps<Props>();
defineEmits(['close']);

const errorList = ref<string[]>([]);
const hourErrorTag = ref(false);
const minuteErrorTag = ref(false);
const dayErrorTag = ref(false);
const monthErrorTag = ref(false);
const yearErrorTag = ref(false);

const daysOfWeek: DayOfWeek[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const selectedPreset = ref('none');

// Set up the reactive interval object
const interval = reactive<Interval>({
  minute: { value: '0' },
  hour: { value: '0' },
  day: { value: '1' },
  month: { value: '*' },
//   year: { value: '*' },
  dayOfWeek: []
});
// const interval = reactive<Interval>(props.config.interval || {
//     minute: { value: '0' },
//     hour: { value: '0' },
//     day: { value: '1' },
//     month: { value: '*' },
//     year: { value: '*' },
//     dayOfWeek: []
// });

// // Toggle a day on/off in the dayOfWeek array
// function toggleDay(day: DayOfWeek) {
//   const idx = interval.dayOfWeek!.indexOf(day);
//   if (idx > -1) {
//     interval.dayOfWeek!.splice(idx, 1);
//   } else {
//     interval.dayOfWeek!.push(day);
//   }
// }

// Watch the preset and update the interval accordingly
watch(selectedPreset, (newVal) => {
  switch (newVal) {
    case 'none':
      interval.minute!.value = '0';
      interval.hour!.value = '0';
      interval.day!.value = '1';
      interval.month!.value = '*';
      interval.year!.value = '*';
      interval.dayOfWeek = [];
      break;
    case 'minutely':
      interval.minute!.value = '*';
      interval.hour!.value = '*';
      interval.day!.value = '*';
      interval.month!.value = '*';
      interval.year!.value = '*';
      interval.dayOfWeek = [];
      break;
    case 'hourly':
      interval.minute!.value = '0';
      interval.hour!.value = '*';
      interval.day!.value = '*';
      interval.month!.value = '*';
      interval.year!.value = '*';
      interval.dayOfWeek = [];
      break;
    case 'daily':
      interval.minute!.value = '0';
      interval.hour!.value = '0';
      interval.day!.value = '*';
      interval.month!.value = '*';
      interval.year!.value = '*';
      interval.dayOfWeek = [];
      break;
    case 'weekly':
      interval.minute!.value = '0';
      interval.hour!.value = '0';
      interval.day!.value = '*';
      interval.month!.value = '*';
      interval.year!.value = '*';
      interval.dayOfWeek = ['Sun']; // default to Sunday
      break;
    case 'monthly':
      interval.minute!.value = '0';
      interval.hour!.value = '0';
      interval.day!.value = '1';
      interval.month!.value = '*';
      interval.year!.value = '*';
      interval.dayOfWeek = [];
      break;
    case 'yearly':
      interval.minute!.value = '0';
      interval.hour!.value = '0';
      interval.day!.value = '1';
      interval.month!.value = '1';
      interval.year!.value = '*';
      interval.dayOfWeek = [];
      break;
  }
});


const daySelectedClass = (dayOfWeek: DayOfWeek) => {
    const isSelected = interval.dayOfWeek!.includes(dayOfWeek);
    return isSelected ? 'bg-green-30 dark:bg-green-700' : '';
}


// Compute a preview string using the manager logic
// const parsedInterval = computed(() => parseIntervalIntoString(interval));
const parsedInterval = computed(() => convertToCronSyntax(interval));

</script>

<style scoped>
.selected {
  background-color: #4caf50;
  color: white;
}
</style>
