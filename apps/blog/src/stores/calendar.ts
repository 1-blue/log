import { create } from "zustand";

export interface ICalendarStore {
  /** 선택 날짜 */
  selectedDate?: Date | null;
  /** 선택 날짜 설정 함수 */
  setSelectedDate: (date: Date) => void;
  /** 선택 날짜 초기화 함수 */
  resetSelectedDate: () => void;
}

/** 내 정보에서 캘린더 선택 관련 처리 훅 ( `zustand` ) */
const useCalendarStore = create<ICalendarStore>()((set) => ({
  selectedDate: null,
  setSelectedDate: (date) => set({ selectedDate: date }),
  resetSelectedDate: () => set({ selectedDate: null }),
}));

export { useCalendarStore };
