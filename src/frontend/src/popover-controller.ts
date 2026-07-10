export function installPopoverController(root: Document | HTMLElement): () => void {
  const closeAll = (except: Element | null = null) => {
    root.querySelectorAll("[data-popover].open").forEach((popover) => {
      if (popover === except) return;
      setOpen(popover, false);
    });
  };

  const onClick = (event: Event) => {
    if (!(event.target instanceof Element)) return;
    const trigger = event.target.closest("[data-popover-trigger]");
    if (trigger) {
      const popover = trigger.closest("[data-popover]");
      if (!popover) return;
      const open = !popover.classList.contains("open");
      closeAll(popover);
      setOpen(popover, open);
      event.stopPropagation();
      return;
    }
    if (!event.target.closest("[data-popover]")) closeAll();
  };

  const onKeyDown = (event: Event) => {
    if (event instanceof KeyboardEvent && event.key === "Escape") closeAll();
  };

  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKeyDown);
  return () => {
    root.removeEventListener("click", onClick);
    root.removeEventListener("keydown", onKeyDown);
    closeAll();
  };
}

function setOpen(popover: Element, open: boolean): void {
  popover.classList.toggle("open", open);
  popover
    .querySelector("[data-popover-trigger]")
    ?.setAttribute("aria-expanded", String(open));
}
