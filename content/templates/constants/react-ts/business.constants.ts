// 示例含义，接入真实项目时以已确认的 API 契约为准。
export const ORDER_STATUS = {
  PENDING: 1,
  PROCESSING: 2,
  COMPLETED: 3,
} as const;

export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];

export const ORDER_STATUS_DICT: Record<OrderStatus, string> = {
  [ORDER_STATUS.PENDING]: '待处理',
  [ORDER_STATUS.PROCESSING]: '处理中',
  [ORDER_STATUS.COMPLETED]: '已完成',
};

export const ORDER_STATUS_OPTIONS = Object.values(ORDER_STATUS).map(value => ({
  value,
  label: ORDER_STATUS_DICT[value],
}));
