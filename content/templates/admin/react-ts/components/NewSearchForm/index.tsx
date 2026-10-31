import type { ReactNode } from 'react';
import { Form, Button, Space } from 'antd';
import type { FormItemConfig, FormModel } from '../../types/admin';
import SearchField from './SearchField';
import { useSearchForm } from './useSearchForm';
import './style.scss';

export interface SearchFormProps<Model extends object = FormModel> {
  formHeader: FormItemConfig[];
  formModel: Model;
  onSubmitForm: (form: Model) => void;
  onResetForm: (form: Model) => void;
  onFormChange?: (form: Model) => void;
  renderField?: (item: FormItemConfig) => ReactNode;
  extra?: ReactNode;
}

export default function NewSearchForm<Model extends object>({
  formHeader,
  formModel,
  onSubmitForm,
  onResetForm,
  onFormChange,
  renderField,
  extra,
}: SearchFormProps<Model>) {
  const { form, initial, snapshot, reset } = useSearchForm(formModel);
  const resetForm = () => {
    reset();
    onFormChange?.(snapshot() as Model);
    onResetForm(snapshot() as Model);
  };
  return (
    <Form
      className="ai-code-search-form"
      form={form}
      initialValues={initial}
      layout="inline"
      onFinish={() => onSubmitForm(snapshot() as Model)}
      onValuesChange={() => onFormChange?.(snapshot() as Model)}
    >
      {formHeader.map((item) => (
        <SearchField key={item.propName} item={item} renderField={renderField} />
      ))}
      <Form.Item className="ai-code-search-form__actions">
        <Space wrap>
          <Button type="primary" htmlType="submit">
            搜索
          </Button>
          <Button onClick={resetForm}>重置</Button>
          {extra}
        </Space>
      </Form.Item>
    </Form>
  );
}
