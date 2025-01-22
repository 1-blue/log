"use client";

import React from "react";
import ActivityCalendar, {
  type Activity,
  type ThemeInput,
} from "react-activity-calendar";
import { Tooltip as ReactTooltip } from "react-tooltip";
import { useTheme } from "next-themes";
import twColors from "tailwindcss/colors";

import "react-tooltip/dist/react-tooltip.css";

import { useCalendarStore } from "#/stores";

const LABELS = {
  months: [
    "1월",
    "2월",
    "3월",
    "4월",
    "5월",
    "6월",
    "7월",
    "8월",
    "9월",
    "10월",
    "11월",
    "12월",
  ],
  weekdays: [
    "일요일",
    "월요일",
    "화요일",
    "수요일",
    "목요일",
    "금요일",
    "토요일",
  ],
  totalCount: "{{year}}년 {{count}}개의 포스팅",
  legend: {
    less: "Less",
    more: "More",
  },
};

/** 색상 테마 */
const explicitTheme: ThemeInput = {
  light: [
    twColors.gray[300],
    twColors.indigo[300],
    twColors.indigo[400],
    twColors.indigo[500],
    twColors.indigo[600],
  ],
  dark: [
    twColors.gray[600],
    twColors.indigo[300],
    twColors.indigo[400],
    twColors.indigo[500],
    twColors.indigo[600],
  ],
};

const TODAY = new Date();

interface Props {
  publishedDates: Record<string, number>;
}

const Calendar: React.FC<Props> = ({ publishedDates }) => {
  const { theme } = useTheme();
  const { setSelectedDate, resetSelectedDate } = useCalendarStore();

  const onSelectDate = (date: Date) => setSelectedDate(date);

  const data: Activity[] = Array.from({ length: 365 }, (_, i) => {
    const date = new Date(
      TODAY.getFullYear(),
      TODAY.getMonth() + 1,
      TODAY.getDay() - i,
    );

    const targetDate = date.toISOString().slice(0, 10);
    const countAndLevel = publishedDates[targetDate] || 0;

    return {
      date: targetDate,
      count: countAndLevel,
      level: countAndLevel > 4 ? 4 : countAndLevel,
    };
  });

  return (
    <>
      <ActivityCalendar
        data={data.reverse()}
        renderBlock={(block, activity) =>
          React.cloneElement(block, {
            "data-tooltip-id": "react-tooltip",
            "data-tooltip-html": `${activity.date}: 포스팅 ${activity.count}개`,
            className: "cursor-pointer",
          })
        }
        labels={LABELS}
        // 월요일 시작
        weekStart={1}
        showWeekdayLabels
        theme={explicitTheme}
        colorScheme={theme === "light" ? "light" : "dark"}
        maxLevel={4}
        eventHandlers={{
          onClick:
            () =>
            ({ date, count }) => {
              if (count === 0) return resetSelectedDate();
              onSelectDate(new Date(date));
            },
        }}
      />

      <ReactTooltip id="react-tooltip" />
    </>
  );
};

export default Calendar;
