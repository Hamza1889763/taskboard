// Inline SVG icons (stroke = currentColor so they follow the theme).

const svg = (paths, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const icons = {
  check: svg('<path d="M20 6 9 17l-5-5"/>', 14),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>', 15),
  trash: svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>', 15),
  left: svg('<path d="m15 18-6-6 6-6"/>', 15),
  right: svg('<path d="m9 18 6-6-6-6"/>', 15),
  calendar: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>', 13),
  list: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/>', 13),
  note: svg('<path d="M4 6h16M4 12h16M4 18h10"/>', 13),
  server: svg('<rect x="2" y="3" width="20" height="8" rx="2"/><rect x="2" y="13" width="20" height="8" rx="2"/><path d="M6 7h.01M6 17h.01"/>', 13),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>', 14),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 16),
};
