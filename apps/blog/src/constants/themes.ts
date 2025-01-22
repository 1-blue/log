import {
  CommandLineIcon,
  MoonIcon,
  SunIcon,
} from "@heroicons/react/24/outline";

/**
 * + 테마 상수
 *   1. 시스템 색상
 *   2. 밝은 색상
 *   3. 어두운 색상
 */
export const THEMES = [
  { label: "시스템 설정", value: "system", Icon: CommandLineIcon },
  { label: "라이트 모드", value: "light", Icon: SunIcon },
  { label: "다크 모드", value: "dark", Icon: MoonIcon },
];
