import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { FormItemProps } from 'antd';
import type { FormItemConfig } from '../../types/admin';

type ValueBinding = Pick<FormItemProps, 'getValueProps' | 'getValueFromEvent'>;
/** UI 值的编码仅存在于控件边界，表单始终存业务原值。 */
export function fieldBinding(item: FormItemConfig): ValueBinding {
  if (!item.itemType || item.itemType === 'selectOne') {
    const options = item.optionsArr ?? [];
    const encode = (value: unknown) => {
      const index = options.findIndex((option) => option.value === value);
      return index >= 0 ? `option:${index}` : value == null ? undefined : `unmapped:${String(value)}`;
    };
    const decode = (value: string | undefined) =>
      value?.startsWith('option:') ? options[Number(value.slice(7))]?.value : undefined;
    return {
      getValueProps: (value: unknown) => ({
        value: Array.isArray(value) ? value.map(encode) : encode(value),
      }),
      getValueFromEvent: (value: string | string[] | undefined) =>
        Array.isArray(value) ? value.map(decode) : decode(value),
    };
  }
  if (item.itemType === 'date' || item.itemType === 'dateRange') {
    const format = item.valueFormat ?? 'YYYY-MM-DD';
    return {
      getValueProps: (value: unknown) => ({
        value:
          item.itemType === 'dateRange'
            ? Array.isArray(value)
              ? value.map((entry) => dayjs(entry))
              : null
            : value == null || value === ''
            ? null
            : dayjs(value as string | number | Date),
      }),
      getValueFromEvent: (value: Dayjs | Dayjs[] | null) =>
        Array.isArray(value) ? value.map((entry) => entry.format(format)) : value?.format(format) ?? null,
    };
  }
  return {};
}
