"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSelectedLayoutSegment } from "next/navigation";
import { Menu, X } from "lucide-react";
import { buildNav, navState, type NavGameweeks, type NavSection } from "@/lib/nav";
import { cn } from "@/lib/utils";

// The header's navigation. From `md` up it's a row of sections, each a link
// to its main page, with a separate button that opens its menu when it has
// several pages (the WAI-ARIA "disclosure navigation" pattern, not an ARIA
// menu: these are ordinary links, and the section links work without
// JavaScript). Below `md` one Menu button opens every
// section's links as a list under the header. Escape closes either and puts
// focus back on its button; clicking outside or following a link closes it.
// The current section is highlighted and the current page's link gets
// aria-current="page".

// Styles are the nav-* classes in globals.css (every page carries this markup).

function useNav(gameweeks: NavGameweeks) {
  const pathname = usePathname() ?? "/";
  const segment = useSelectedLayoutSegment();
  const sections = React.useMemo(() => buildNav(gameweeks), [gameweeks]);
  return { sections, ...navState(sections, pathname, segment) };
}

/** Moves focus between a menu's links with the arrow keys, Home and End. */
function focusLink(list: HTMLElement | null, move: "first" | "last" | "next" | "previous") {
  const links = Array.from(list?.querySelectorAll<HTMLAnchorElement>("a") ?? []);
  if (!links.length) return;
  const at = links.indexOf(document.activeElement as HTMLAnchorElement);
  const index =
    move === "first"
      ? 0
      : move === "last"
        ? links.length - 1
        : move === "next"
          ? (at + 1) % links.length
          : (at - 1 + links.length) % links.length;
  links[index].focus();
}

function NavLinks({
  section,
  current,
  onNavigate,
}: Readonly<{ section: NavSection; current: string | null; onNavigate: () => void }>) {
  return section.links.map((link) => (
    <li key={link.href}>
      <Link href={link.href} aria-current={link.href === current ? "page" : undefined} onClick={onNavigate}>
        {link.label}
      </Link>
    </li>
  ));
}

function DesktopNav({ gameweeks }: Readonly<{ gameweeks: NavGameweeks }>) {
  const { sections, active, current } = useNav(gameweeks);
  const [open, setOpen] = React.useState<string | null>(null);
  const navRef = React.useRef<HTMLElement>(null);
  const id = "nav"; // one header per page, so fixed ids are unique (and short)

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const button = (sectionId: string) => document.getElementById(`${id}-${sectionId}-button`);
  const list = (sectionId: string) => document.getElementById(`${id}-${sectionId}`);
  const close = () => setOpen(null);

  return (
    <nav ref={navRef} aria-label="Main" className="hidden md:block">
      <ul className="flex items-center gap-1 lg:gap-2">
        {sections.map((section) => {
          const isActive = section.id === active;
          const sectionLink = (
            <Link
              href={section.href}
              aria-current={section.href === current ? "page" : undefined}
              data-active={isActive || undefined}
              className="nav-item"
            >
              {section.label}
              {isActive && <span className="sr-only"> (current section)</span>}
            </Link>
          );
          if (section.links.length === 1) return <li key={section.id}>{sectionLink}</li>;
          const isOpen = open === section.id;
          return (
            <li
              key={section.id}
              className="relative"
              onBlur={(event) => {
                if (isOpen && !event.currentTarget.contains(event.relatedTarget as Node | null)) close();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && isOpen) {
                  event.preventDefault();
                  close();
                  button(section.id)?.focus();
                } else if (isOpen && (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End")) {
                  event.preventDefault();
                  const inList = list(section.id)?.contains(document.activeElement);
                  const move =
                    event.key === "Home"
                      ? "first"
                      : event.key === "End"
                        ? "last"
                        : !inList
                          ? event.key === "ArrowDown"
                            ? "first"
                            : "last"
                          : event.key === "ArrowDown"
                            ? "next"
                            : "previous";
                  focusLink(list(section.id), move);
                }
              }}
            >
              <div className="flex items-center">
                {sectionLink}
                <button
                  type="button"
                  id={`${id}-${section.id}-button`}
                  aria-label={`${section.label} menu`}
                  aria-expanded={isOpen}
                  aria-controls={`${id}-${section.id}`}
                  onClick={() => setOpen(isOpen ? null : section.id)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown" && !isOpen) {
                      event.preventDefault();
                      setOpen(section.id);
                      requestAnimationFrame(() => focusLink(list(section.id), "first"));
                    }
                  }}
                  data-active={isActive || undefined}
                  className="nav-item -ml-1 px-1.5"
                >
                  <span className="nav-chevron" aria-hidden />
                </button>
              </div>
              <ul
                id={`${id}-${section.id}`}
                hidden={!isOpen}
                className={cn("nav-panel nav-list", section.id === "tools" ? "right-0" : "left-0")}
              >
                <NavLinks section={section} current={current} onNavigate={close} />
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function MobileNav({ gameweeks }: Readonly<{ gameweeks: NavGameweeks }>) {
  const { sections, active, current } = useNav(gameweeks);
  const [open, setOpen] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLElement>(null);
  const id = "mnav";

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        onClick={() => setOpen((o) => !o)}
        className="nav-item md:hidden"
      >
        {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        Menu
      </button>
      {/* Only in the DOM while open, so it adds nothing to each page's HTML. */}
      {open && (
        <nav
          ref={panelRef}
          id={`${id}-menu`}
          aria-label="Main"
          className="absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-gray-200 bg-white px-4 pb-4 shadow-lg md:hidden dark:border-gray-700 dark:bg-gray-900"
        >
          <div className="mx-auto grid max-w-2xl gap-x-6 gap-y-3 pt-3 sm:grid-cols-2">
            {sections.map((section) => (
              <div key={section.id}>
                <p
                  id={`${id}-${section.id}`}
                  className={cn(
                    "px-3 pb-1 text-xs font-semibold uppercase tracking-wide",
                    section.id === active ? "text-emerald-700 dark:text-emerald-400" : "text-gray-500 dark:text-gray-400",
                  )}
                >
                  {section.label}
                  {section.id === active && <span className="sr-only"> (current section)</span>}
                </p>
                <ul aria-labelledby={`${id}-${section.id}`} className="nav-list">
                  <NavLinks section={section} current={current} onNavigate={() => setOpen(false)} />
                </ul>
              </div>
            ))}
          </div>
        </nav>
      )}
    </>
  );
}

export default function SiteNav({ gameweeks }: Readonly<{ gameweeks: NavGameweeks }>) {
  return (
    <>
      <DesktopNav gameweeks={gameweeks} />
      <MobileNav gameweeks={gameweeks} />
    </>
  );
}
