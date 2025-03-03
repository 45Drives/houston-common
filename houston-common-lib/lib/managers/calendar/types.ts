
// export type TimeUnit = 'minute' | 'hour' | 'day' | 'month' | 'year';
export type TimeUnit = 'minute' | 'hour' | 'day' | 'month' | 'dayOfWeek';
// export type DayOfWeek = 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';
export type DayOfWeek = '0' | '1' | '2' | '3' | '4' | '5' | '6' | 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';

export interface TimeComponent {
    value: string;
}

// export interface Interval {
//     minute?: TimeComponent;
//     hour?: TimeComponent;
//     day?: TimeComponent;
//     month?: TimeComponent;
//     year?: TimeComponent;
//     dayOfWeek?: DayOfWeek[];
// }

export interface Interval {
    minute?: TimeComponent;
    hour?: TimeComponent;
    day?: TimeComponent;
    month?: TimeComponent;
    // dayOfWeek?: string;  // Change to a comma-separated string for cron compatibility
    dayOfWeek?: DayOfWeek[];
}
