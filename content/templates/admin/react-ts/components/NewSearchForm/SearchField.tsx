import type { CSSProperties, ReactNode } from 'react';
import { Form, Input, Select, DatePicker } from 'antd';
import type { FormItemConfig } from '../../types/admin';
import { fieldBinding } from './fieldBinding';

type Props = { item: FormItemConfig; renderField?: (item: FormItemConfig) => ReactNode };
function control({ item, renderField }: Props) {
  const common = {
    className: 'ai-code-search-form__control',
    disabled: item.disabled,
    allowClear: item.clearable !== false,
  };
  switch (item.itemType) {
    case 'text':
      return <Input {...common} placeholder={item.placeholder} />;
    case 'custom':
      return renderField?.(item);
    case 'date':
      return (
        <DatePicker
          {...common}
          placeholder={item.placeholder}
          format={item.format ?? item.valueFormat ?? 'YYYY-MM-DD'}
          disabledDate={(date) => item.disabledDate?.(date.toDate()) ?? false}
        />
      );
    case 'dateRange':
      return (
        <DatePicker.RangePicker
          {...common}
          format={item.format ?? item.valueFormat ?? 'YYYY-MM-DD'}
          disabledDate={(date) => item.disabledDate?.(date.toDate()) ?? false}
        />
      );
    default:
      return (
        <Select
          {...common}
          placeholder={item.placeholder}
          mode={item.multiple ? 'multiple' : undefined}
          showSearch={item.filterable}
          optionFilterProp="label"
          options={(item.optionsArr ?? []).map((option, index) => ({
            label: option.label,
            value: `option:${index}`,
          }))}
        />
      );
  }
}
export default function SearchField(props: Props) {
  const { item } = props;
  const style = {
    '--ai-code-field-width': item.width ?? (item.itemType === 'dateRange' ? '240px' : '150px'),
  } as CSSProperties;
  return (
    <Form.Item
      className="ai-code-search-form__field"
      style={style}
      name={item.propName}
      label={item.labelName}
      rules={item.isRequired ? [{ required: true, message: `请填写${item.labelName ?? item.propName}` }] : []}
      {...fieldBinding(item)}
    >
      {control(props)}
    </Form.Item>
  );
}
