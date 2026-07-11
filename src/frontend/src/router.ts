export type Navigate = (href: string, replace?: boolean) => void;
export function currentLocation(): URL { return new URL(window.location.href); }
