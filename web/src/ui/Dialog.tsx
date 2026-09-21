import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { DialogHTMLAttributes, ReactNode } from 'react';

export const NativeDialog = forwardRef<HTMLDialogElement, DialogHTMLAttributes<HTMLDialogElement> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}>(({ open, onOpenChange, children, ...props }, forwardedRef) => {
  const dialog = useRef<HTMLDialogElement>(null);
  useImperativeHandle(forwardedRef, () => dialog.current!, []);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  return <dialog {...props} ref={dialog}
    onCancel={(event) => { props.onCancel?.(event); if (!event.defaultPrevented) onOpenChange(false); }}
    onClose={(event) => { props.onClose?.(event); onOpenChange(false); }}>
    {children}
  </dialog>;
});
NativeDialog.displayName = 'NativeDialog';
