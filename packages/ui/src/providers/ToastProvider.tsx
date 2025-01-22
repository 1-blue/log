"use client";

import { useToastStore } from "../stores";
import Portal from "../components/Portal";
import { Toast } from "../components/atoms/Toast";

const ToastProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const toasts = useToastStore((store) => store.toasts);
  const closeToast = useToastStore((store) => store.closeToast);

  return (
    <>
      {children}

      <Portal rootName="toast-root">
        {toasts.map((toast) => (
          <Toast key={toast.id} closeToast={closeToast} {...toast} />
        ))}
      </Portal>
    </>
  );
};

export { ToastProvider };
