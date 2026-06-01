import React from "react";
import { useStore } from "../state/store";
import { Icons } from "./Icons";

export const Toasts: React.FC = () => {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <>
      {toasts.map((t) => (
        <div key={t.id} className={"toast " + (t.kind === "error" ? "error" : "")}>
          {t.kind === "error" ? <Icons.Warning size={13} /> : <Icons.Info size={13} />}
          <span>{t.message}</span>
          <span className="close" onClick={() => dismiss(t.id)}>
            <Icons.X size={11} />
          </span>
        </div>
      ))}
    </>
  );
};
