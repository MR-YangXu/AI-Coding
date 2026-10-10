// 示例：只有语义与接口契约一致的功能才共用这个开关定义。
export const SWITCH_STATE = { OFF: 0, ON: 1 };

export const SWITCH_STATE_DICT = {
  [SWITCH_STATE.OFF]: '关闭',
  [SWITCH_STATE.ON]: '开启',
};
