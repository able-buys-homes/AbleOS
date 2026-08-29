// src/lib/DocumentTitle.tsx
// Sets the browser tab from the route. Mounted once, so no cockpit page has to
// remember to do it - a page that forgets would silently inherit the last one.
import React from "react";
import { useLocation } from "react-router-dom";

const TITLES: Record<string, string> = {
  "/raj": "Raj Cockpit",
  "/raj/pipeline": "Pipeline",
  "/dane": "Dane Cockpit",
  "/jeremiah": "Jeremiah Cockpit",
  "/colton": "Colton Cockpit",
  "/zo": "Zo Cockpit",
  "/zo/inspect": "Unit Inspection",
  "/karen": "Karen Cockpit",
  "/rex": "Rex Cockpit",
  "/ellery": "Ellery Cockpit",
  "/cornelius": "Cornelius Cockpit",
};

export function DocumentTitle() {
  const { pathname } = useLocation();

  React.useEffect(() => {
    const name = TITLES[pathname.replace(/\/+$/, "") || "/"];
    document.title = name ? `${name} · Able Buys Homes` : "Able Buys Homes";
  }, [pathname]);

  return null;
}