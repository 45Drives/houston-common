
import { Interval, TimeUnit } from './types';
import { TaskSchedule } from '../backup';

function getMonthName(number: number): string {
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[number - 1] || 'undefined';
}

function getDaySuffix(day: number): string {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
    }
}

function formatTime12h(hour: number, minute: number): string {
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const h = (hour % 12) === 0 ? 12 : hour % 12;
    const m = minute.toString().padStart(2, '0');
    return `${h}:${m} ${suffix}`;
}


function formatUnit(value: string, type: TimeUnit): string {
    if (value === '*') {
        return type === 'minute'
            ? 'every minute'
            : type === 'hour'
                ? 'every hour'
                : `every ${type}`;
    } else if (value.startsWith('*/')) {
        const interval = value.slice(2);
        return `every ${interval} ${type}${Number(interval) > 1 ? 's' : ''}`;
    } else if (value.includes('/')) {
        const [base, step] = value.split('/');
        if (type === 'day') {
            return `every ${step} days starting on the ${base}${getDaySuffix(Number(base))}`;
        }
        return `every ${step} ${type}${Number(step) > 1 ? 's' : ''} starting from ${base}`;
    } else if (value === '0' && type === 'minute') {
        return 'at the start of the hour';
    } else if (value === '0' && type === 'hour') {
        return 'at midnight';
    } else if (type === 'day') {
        return `on the ${value}${getDaySuffix(Number(value))} of the month`;
    } else if (type === 'month') {
        return `in ${getMonthName(Number(value))}`;
    }
    return `at ${value} ${type}`;
}

function formatUnitForCron(value: string): string {
    if (value === '*') return '*'; // Every unit
    if (value.startsWith('*/')) return value; // Every N units (*/5 for every 5 minutes)
    if (value.includes(',')) return value; // List of specific values (e.g., 1,3,5)
    if (value.includes('-')) return value; // Range of values (e.g., 1-5)
    return value; // Specific value
}

export function convertToCronSyntax(interval: Interval): string {
    const minute = formatUnitForCron(interval.minute?.value || '*');
    const hour = formatUnitForCron(interval.hour?.value || '*');
    const day = formatUnitForCron(interval.day?.value || '*');
    const month = formatUnitForCron(interval.month?.value || '*');
    const dayOfWeek = interval.dayOfWeek ? convertDayOfWeekToCron(interval.dayOfWeek.toString()) : '*';

    return `${minute} ${hour} ${day} ${month} ${dayOfWeek}`;
}

export function convertDayOfWeekToCron(dayOfWeek: string): string {
    const dayMap: { [key: string]: string } = {
        'Sun': '0', 'Mon': '1', 'Tue': '2', 'Wed': '3', 'Thu': '4', 'Fri': '5', 'Sat': '6'
    };
    if (dayOfWeek.includes(',')) {
        return dayOfWeek.split(',').map(day => dayMap[day] || day).join(',');
    }
    return dayMap[dayOfWeek] || dayOfWeek;
}


export function parseIntervalIntoString(interval: Interval): string {
    const elements: string[] = [];
    const formattedMinute = interval.minute ? formatUnit(interval.minute.value, 'minute') : null;
    const formattedHour = interval.hour ? formatUnit(interval.hour.value, 'hour') : null;

    // Special case for midnight
    if (formattedMinute === null && formattedHour === 'at midnight') {
        elements.push('at midnight');
    } else {
        if (formattedMinute) elements.push(formattedMinute);
        if (formattedHour) elements.push(formattedHour);
    }

    const formattedDay = interval.day ? formatUnit(interval.day.value, 'day') : 'every day';
    const formattedMonth = interval.month ? formatUnit(interval.month.value, 'month') : 'every month';
    // const formattedYear = interval.year ? formatUnit(interval.year.value, 'year') : 'every year';

    // elements.push(formattedDay, formattedMonth, formattedYear);
    elements.push(formattedDay, formattedMonth);

    if (interval.dayOfWeek && interval.dayOfWeek.length > 0) {
        elements.push(`only on ${interval.dayOfWeek.join(', ')}`);
    }

    return elements.filter(e => e).join(', ');
}

export function formatCronToHumanReadable(cron: string): string {
    const [minute, hour, day, month, dayOfWeek] = cron.split(' ');

    const cronMinute = minute === '*' ? 0 : parseInt(minute!);
    const cronHour = hour === '*' ? 0 : parseInt(hour!);
    const timeString = (minute === '*' && hour === '*')
        ? 'every hour'
        : `at ${formatTime12h(cronHour, cronMinute)}`;

    const formattedDay = formatCronPart(day!, 'day');
    const formattedMonth = formatCronPart(month!, 'month');
    const formattedDayOfWeek = formatCronPart(dayOfWeek!, 'dayOfWeek');

    let result = `${timeString}`;

    if (formattedDay !== 'every day') {
        result += ` on ${formattedDay}`;
    }

    if (formattedMonth !== 'every month') {
        result += ` in ${formattedMonth}`;
    }

    if (formattedDayOfWeek !== 'every day') {
        result += ` only on ${formattedDayOfWeek}`;
    }

    return result.trim();
}


function formatCronPart(value: string, type: TimeUnit): string {
    if (value === '*') {
        if (type === 'minute') return 'every minute';
        if (type === 'hour') return 'every hour';
        if (type === 'day') return 'every day';
        if (type === 'month') return 'every month';
        if (type === 'dayOfWeek') return 'every day';
    }

    if (value.startsWith('*/')) {
        const interval = value.slice(2);
        return `every ${interval} ${type}${Number(interval) > 1 ? 's' : ''}`;
    }

    if (value.includes(',')) {
        return value.split(',').map(v => formatCronPart(v, type)).join(', ');
    }

    if (value.includes('-')) {
        return `from ${value.replace('-', ' to ')}`;
    }

    if (type === 'minute' || type === 'hour') {
        return value;
    }

    if (type === 'day') {
        return `the ${value}${getDaySuffix(Number(value))}`;
    }

    if (type === 'month') {
        return getMonthName(Number(value));
    }

    if (type === 'dayOfWeek') {
        return convertCronToDayName(value);
    }

    return value;
}


function convertCronToDayName(value: string): string {
    const dayMap: { [key: string]: string } = {
        '0': 'Sunday', '1': 'Monday', '2': 'Tuesday',
        '3': 'Wednesday', '4': 'Thursday', '5': 'Friday', '6': 'Saturday'
    };
    return dayMap[value] || value;
}

export function validateCronField(value: string, type: TimeUnit): boolean {
    if (value === '*') return true; // Allow all values

    if (value.startsWith('*/')) {
        // */N is only valid for minute, hour
        return type === 'minute' || type === 'hour';
    }

    if (value.includes(',')) {
        return value.split(',').every(v => validateCronField(v.trim(), type));
    }

    if (value.includes('-')) {
        const [start, end] = value.split('-').map(Number);
        return !isNaN(start!) && !isNaN(end!) && start! <= end!;
    }

    // Ensure valid numeric range
    const num = Number(value);
    switch (type) {
        case 'minute': return num >= 0 && num <= 59;
        case 'hour': return num >= 0 && num <= 23;
        case 'day': return num >= 1 && num <= 31;
        case 'month': return num >= 1 && num <= 12;
        case 'dayOfWeek': return num >= 0 && num <= 6;
    }

    return false;
}

export function parseTaskScheduleIntoString(schedule: TaskSchedule): string {
    const elements: string[] = [];

    const startDay = schedule.startDate.getDate();
    const startMonth = schedule.startDate.toLocaleString("en-US", { month: "long" });
    const startHour = schedule.startDate.getHours().toString().padStart(2, '0');
    const startMinute = schedule.startDate.getMinutes().toString().padStart(2, '0');

    const startTimeString = `at ${startHour}:${startMinute}`;

    switch (schedule.repeatFrequency) {
        case "hour":
            elements.push(`starting on ${startMonth} ${startDay}${getOrdinalSuffix(startDay)} ${startTimeString}`);
            elements.push("every hour");
            break;
        case "day":
            elements.push(`starting on ${startMonth} ${startDay}${getOrdinalSuffix(startDay)} ${startTimeString}`);
            elements.push(`every day at ${startHour}:${startMinute}`);
            break;
        case "week":
            const dayOfWeek = schedule.startDate.toLocaleString("en-US", { weekday: "long" });
            elements.push(`starting on ${startMonth} ${startDay}${getOrdinalSuffix(startDay)} ${startTimeString}`);
            elements.push(`every week on ${dayOfWeek} at ${startHour}:${startMinute}`);
            break;
        case "month":
            elements.push(`starting on ${startMonth} ${startDay}${getOrdinalSuffix(startDay)} ${startTimeString}`);
            elements.push(`every month on the ${startDay}${getOrdinalSuffix(startDay)} at ${startHour}:${startMinute}`);
            break;
    }

    return elements.filter(e => e).join(", ");
}

// Helper function to format ordinal numbers (1st, 2nd, 3rd, etc.)
function getOrdinalSuffix(n: number): string {
    if (n >= 11 && n <= 13) return "th";
    switch (n % 10) {
        case 1: return "st";
        case 2: return "nd";
        case 3: return "rd";
        default: return "th";
    }
}

