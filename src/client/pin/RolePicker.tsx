// 役割を選ぶ欄（11/5 作者）。ブラウザの選ぶ欄（select）は開いたときの一覧が白い箱で、暗い半透明の欄と合わなかったので自前で作った。
// 押すと下に同じ暗い半透明の一覧が開く。キーボード: ↑↓ で動かす・Enter と Space で決める・Esc で閉じる。外を押しても閉じる
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

interface Role {
  value: string;
  label: string;
}

export function RolePicker({ roles, value, onChange }: { roles: readonly Role[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(() => Math.max(0, roles.findIndex((r) => r.value === value)));
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    addEventListener("pointerdown", away);
    return () => removeEventListener("pointerdown", away);
  }, [open]);

  const choose = (i: number) => {
    onChange(roles[i].value);
    setOpen(false);
    btn.current?.focus();
  };
  const show = () => {
    setHi(Math.max(0, roles.findIndex((r) => r.value === value)));
    setOpen(true);
  };

  function key(e: KeyboardEvent) {
    if (e.key === "Escape") return setOpen(false);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return show();
      const d = e.key === "ArrowDown" ? 1 : -1;
      return setHi((h) => (h + d + roles.length) % roles.length);
    }
    if ((e.key === "Enter" || e.key === " ") && open) {
      e.preventDefault();
      choose(hi);
    }
  }

  const current = roles.find((r) => r.value === value);
  return (
    <div className={`role-pick${open ? " open" : ""}`} ref={box} onKeyDown={key}>
      <button
        type="button"
        ref={btn}
        className="role-pick-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="役割"
        onClick={() => (open ? setOpen(false) : show())}
        data-testid="tenant-pin-role"
        data-value={value}
      >
        <span>{current?.label}</span>
        <svg className="role-pick-chev" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="role-pick-list" role="listbox" aria-label="役割">
          {roles.map((r, i) => (
            <li
              key={r.value}
              role="option"
              aria-selected={r.value === value}
              className={`${i === hi ? "hi" : ""}${r.value === value ? " on" : ""}`}
              onPointerEnter={() => setHi(i)}
              onClick={() => choose(i)}
              data-testid={`tenant-pin-role-${r.value}`}
            >
              {r.label}
              {r.value === value && (
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
