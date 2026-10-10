// 示例：只有语义与接口契约一致的功能才共用这个开关定义。
export const SWITCH_STATE = { OFF: 0, ON: 1 } as const;
export type SwitchState = typeof SWITCH_STATE[keyof typeof SWITCH_STATE];

export const SWITCH_STATE_DICT: Record<SwitchState, string> = {
  [SWITCH_STATE.OFF]: '关闭',
  [SWITCH_STATE.ON]: '开启',
};
