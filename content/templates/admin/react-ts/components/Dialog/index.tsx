import { createContext, createElement, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import BaseDialog from './BaseDialog';
import type { BaseDialogProps } from './BaseDialog';
export { BaseDialog };
export type { BaseDialogProps };
export interface DialogOptions extends Omit<BaseDialogProps, 'open' | 'onOpenChange' | 'children' | 'onClosed'> {
  content?: ReactNode;
}
export interface DialogInstance {
  close: () => void;
  update: (options: Partial<DialogOptions>) => void;
}
interface Entry {
  id: number;
  open: boolean;
  options: DialogOptions;
  notified: boolean;
  mounted: boolean;
}
function EntryDialog({ entry, close, remove }: { entry: Entry; close: () => void; remove: () => void }) {
  useLayoutEffect(() => {
    entry.mounted = true;
    return () => {
      entry.mounted = false;
    };
  }, [entry]);
  return (
    <BaseDialog
      {...entry.options}
      open={entry.open}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      onClose={close}
      onClosed={remove}
    >
      {entry.options.content}
    </BaseDialog>
  );
}
export interface DialogService {
  showDialog: (options: DialogOptions | string) => DialogInstance;
  Dialog: {
    alert: (content: string, title?: string) => DialogInstance;
    confirm: (content: string, title?: string) => Promise<boolean>;
    component: <P extends object>(component: ComponentType<P>, props: P) => DialogInstance;
  };
}
const Context = createContext<DialogService | null>(null);
export function useDialog() {
  const value = useContext(Context);
  if (!value) throw new Error('useDialog 必须在 DialogProvider 内使用');
  return value;
}
export function DialogProvider({ children }: { children?: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const current = useRef<Entry[]>([]);
  const serial = useRef(0);
  const mounted = useRef(true);
  const service = useMemo(() => {
    const publish = () => {
      if (mounted.current) setEntries([...current.current]);
    };
    const close = (entry: Entry) => {
      if (entry.notified) return;
      entry.notified = true;
      entry.open = false;
      if (!entry.mounted) current.current = current.current.filter((item) => item !== entry);
      publish();
      entry.options.onClose?.();
    };
    const showDialog = (input: DialogOptions | string): DialogInstance => {
      if (!mounted.current) throw new Error('DialogProvider 已卸载');
      const entry: Entry = {
        id: ++serial.current,
        open: true,
        notified: false,
        mounted: false,
        options: typeof input === 'string' ? { content: input } : { ...input },
      };
      current.current = [...current.current, entry];
      publish();
      return {
        close: () => close(entry),
        update: (options) => {
          if (!entry.notified) {
            entry.options = { ...entry.options, ...options };
            publish();
          }
        },
      };
    };
    return {
      showDialog,
      close,
      Dialog: {
        alert: (content: string, title = '提示') => showDialog({ content, title, showCancel: false }),
        confirm: (content: string, title = '确认') =>
          new Promise<boolean>((resolve) => {
            showDialog({
              content,
              title,
              onConfirm: () => {
                resolve(true);
              },
              onClose: () => resolve(false),
            });
          }),
        component: <P extends object>(component: ComponentType<P>, props: P) =>
          showDialog({ content: createElement(component, props), showCancel: false, showConfirm: false }),
      },
    };
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      current.current.forEach(service.close);
      current.current = [];
    };
  }, [service]);
  return (
    <Context.Provider value={service}>
      {children}
      {entries.map((entry) => (
        <EntryDialog
          key={entry.id}
          entry={entry}
          close={() => service.close(entry)}
          remove={() => {
            current.current = current.current.filter((item) => item.id !== entry.id);
            if (mounted.current) setEntries([...current.current]);
          }}
        />
      ))}
    </Context.Provider>
  );
}
