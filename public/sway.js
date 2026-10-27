// Hanging tags that sway like a mobile: each tag is a damped pendulum, nudged by
// scrolling, by tilting the phone, and by a tap. Still for prefers-reduced-motion.
export function hang(container) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const items = [...container.querySelectorAll("[data-hang]")].map((el, i) => ({
    el,
    angle: (i % 2 ? -1 : 1) * (2 + i), // start slightly out of rest so it settles in
    speed: 0,
    stiffness: 0.012 + 0.004 * (i % 3), // longer threads swing slower
    damping: 0.985,
  }));
  if (reduce) {
    items.forEach((it) => { it.el.style.transform = "rotate(0deg)"; });
    return () => {};
  }

  let lastY = scrollY;
  const onScroll = () => {
    const dy = scrollY - lastY;
    lastY = scrollY;
    items.forEach((it, i) => { it.speed += dy * 0.02 * (i % 2 ? -1 : 1); });
  };
  const onTilt = (e) => {
    if (e.gamma == null) return;
    const g = Math.max(-30, Math.min(30, e.gamma));
    items.forEach((it) => { it.rest = g * 0.25; });
  };
  const onTap = (e) => {
    const it = items.find((x) => x.el.contains(e.target));
    if (it) it.speed += 1.6 * (Math.random() > 0.5 ? 1 : -1);
  };
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("deviceorientation", onTilt);
  container.addEventListener("pointerdown", onTap);

  let frame;
  const breeze = () => Math.sin(performance.now() / 2400) * 0.6; // a slow draft so it never fully stops
  const tick = () => {
    for (const it of items) {
      const rest = (it.rest ?? 0) + breeze();
      it.speed += (rest - it.angle) * it.stiffness;
      it.speed *= it.damping;
      it.angle += it.speed;
      it.el.style.transform = `rotate(${it.angle.toFixed(2)}deg)`;
    }
    frame = requestAnimationFrame(tick);
  };
  tick();
  return () => {
    cancelAnimationFrame(frame);
    removeEventListener("scroll", onScroll);
    removeEventListener("deviceorientation", onTilt);
  };
}
