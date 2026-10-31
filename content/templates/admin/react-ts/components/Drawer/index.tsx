import { OverlayShell } from '../Dialog/BaseDialog';
import type { BaseDialogProps } from '../Dialog/BaseDialog';
export function BaseDrawer(props: BaseDialogProps) {
  return <OverlayShell {...props} kind="drawer" />;
}
export default BaseDrawer;
