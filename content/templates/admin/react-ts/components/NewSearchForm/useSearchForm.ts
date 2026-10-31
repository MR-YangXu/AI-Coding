import { useEffect, useRef } from 'react';
import { Form } from 'antd';
import { clone } from '../../utils/adminCore';
import type { FormModel } from '../../types/admin';

export function useSearchForm(model: object) {
  const [form] = Form.useForm<FormModel>();
  const initial = useRef(clone(model) as FormModel);
  const previous = useRef(clone(model) as FormModel);
  const removed = useRef(new Set<string>());
  useEffect(() => {
    const next = model as FormModel;
    const changed: FormModel = {};
    for (const key of new Set([...Object.keys(previous.current), ...Object.keys(next)])) {
      if (!Object.prototype.hasOwnProperty.call(next, key)) {
        changed[key] = undefined;
        removed.current.add(key);
      } else {
        removed.current.delete(key);
        if (
          !Object.prototype.hasOwnProperty.call(previous.current, key) ||
          JSON.stringify(previous.current[key]) !== JSON.stringify(next[key])
        )
          changed[key] = clone(next[key]);
      }
    }
    form.setFieldsValue(changed);
    previous.current = clone(next);
  }, [form, model]);
  return {
    form,
    initial: initial.current,
    snapshot: () => {
      // true 包含分页等未注册字段；删除外部移除的键，不提交 undefined 占位。
      const values = clone(form.getFieldsValue(true));
      for (const key of removed.current) if (values[key] === undefined) delete values[key];
      return values;
    },
    reset: () => {
      form.resetFields();
      form.setFieldsValue(clone(initial.current));
      removed.current.clear();
      return clone(initial.current);
    },
  };
}
