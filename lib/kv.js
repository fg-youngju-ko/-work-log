// localStorage에서 그대로 옮겨온 "키 하나당 JSON 값 하나" 저장소. entries처럼
// 영구 누적되지 않고 완료 시 삭제되어 크기가 작게 유지되는 나머지 데이터 전용.
export const KV_ALLOWED_KEYS = [
  'workLog.todos',
  'workLog.categories',
  'workLog.categoryColors',
  'workLog.dailyTemplates',
  'workLog.dailyCompletions',
  'workLog.calendarEvents',
  'workLog.projects',
  'workLog.projectColors',
  'workLog.laborSettings',
];
