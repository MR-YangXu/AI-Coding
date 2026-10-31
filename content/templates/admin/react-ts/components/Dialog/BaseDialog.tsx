import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal, Drawer, Button, Space } from 'antd';
export interface BaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  children?: ReactNode;
  width?: string | number;
  confirmText?: string;
  cancelText?: string;
  showConfirm?: boolean;
  showCancel?: boolean;
  showClose?: boolean;
  closeOnClickModal?: boolean;
  destroyOnClose?: boolean;
  footer?: ReactNode;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
  onClose?: () => void;
  onClosed?: () => void;
  onError?: (error: unknown) => void;
}
export function OverlayShell({ kind = 'dialog', ...props }: BaseDialogProps & { kind?: 'dialog' | 'drawer' }) {
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState('');
  const pending = useRef(false);
  const generation = useRef(0);
  const closed = useRef(!props.open);
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    generation.current++;
    pending.current = false;
    setLoading(false);
    setFailure('');
    closed.current = !props.open;
  }, [props.open]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const close = () => {
    if (closed.current) return;
    closed.current = true;
    generation.current++;
    pending.current = false;
    setLoading(false);
    props.onOpenChange(false);
    props.onClose?.();
  };
  const cancel = () => {
    if (pending.current) return;
    props.onCancel?.();
    close();
  };
  const confirm = async () => {
    if (pending.current || closed.current) return;
    pending.current = true;
    setLoading(true);
    setFailure('');
    const ticket = ++generation.current;
    try {
      await props.onConfirm?.();
      if (ticket === generation.current) close();
    } catch (error) {
      if (ticket === generation.current) {
        setFailure(error instanceof Error ? error.message : '操作失败');
        props.onError?.(error);
      }
    } finally {
      if (ticket === generation.current) {
        pending.current = false;
        setLoading(false);
      }
    }
  };
  const footer =
    props.footer !== undefined ? (
      props.footer
    ) : (
      <Space>
        {(props.showCancel ?? kind === 'dialog') && (
          <Button disabled={loading} onClick={cancel}>
            {props.cancelText ?? '取消'}
          </Button>
        )}
        {(props.showConfirm ?? kind === 'dialog') && (
          <Button
            type="primary"
            loading={loading}
            onClick={() => {
              void confirm();
            }}
          >
            {props.confirmText ?? '确定'}
          </Button>
        )}
      </Space>
    );
  const content = (
    <>
      {props.children}
      {failure && <p role="alert">{failure}</p>}
    </>
  );
  return kind === 'dialog' ? (
    <Modal
      open={props.open}
      title={props.title}
      width={props.width}
      footer={footer}
      onCancel={cancel}
      closable={props.showClose !== false && !loading}
      maskClosable={Boolean(props.closeOnClickModal) && !loading}
      keyboard={!loading}
      destroyOnClose={props.destroyOnClose !== false}
      afterClose={props.onClosed}
    >
      {content}
    </Modal>
  ) : (
    <Drawer
      open={props.open}
      title={props.title}
      width={props.width ?? 480}
      footer={footer}
      onClose={cancel}
      closable={props.showClose !== false && !loading}
      maskClosable={Boolean(props.closeOnClickModal) && !loading}
      keyboard={!loading}
      destroyOnClose={props.destroyOnClose !== false}
      afterOpenChange={(open) => {
        if (!open) latest.current.onClosed?.();
      }}
    >
      {content}
    </Drawer>
  );
}
export default function BaseDialog(props: BaseDialogProps) {
  return <OverlayShell {...props} />;
}
