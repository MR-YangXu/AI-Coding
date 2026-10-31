import { useEffect, useRef, useState } from 'react';
import { clone, createOptionsController } from '../utils/adminCore';
import type { FormItemConfig } from '../types/admin';
export function useSelectOptions(initialItems: FormItemConfig[]) {
  const [formHeader, setFormHeader] = useState(() => clone(initialItems));
  const fields = useRef(initialItems.map((item) => item.propName));
  const reference = useRef<ReturnType<typeof createOptionsController> | null>(null);
  if (!reference.current)
    reference.current = createOptionsController((field, options) => {
      if (!fields.current.includes(field)) throw new Error(`找不到搜索字段：${field}`);
      setFormHeader((items) =>
        items.map((item) => (item.propName === field ? { ...item, optionsArr: options } : item)),
      );
    });
  const controller = reference.current;
  useEffect(() => {
    controller.activate();
    return controller.dispose;
  }, [controller]);
  return { ...controller, formHeader };
}
