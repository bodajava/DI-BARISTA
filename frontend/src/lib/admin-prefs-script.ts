export const ADMIN_LANG_KEY = "admin_lang";
export const ADMIN_THEME_KEY = "admin_theme";
export const ADMIN_PREFS_EVENT = "admin-prefs-change";

/**
 * Applied in <head> before first paint (see app/(admin)/layout.tsx), so a saved Arabic /
 * light choice never flashes the defaults. No saved theme = follow the OS, like the store.
 * Kept out of the "use client" module so the server layout gets the real string.
 */
export const ADMIN_PREFS_SCRIPT = `(function(){try{var d=document.documentElement;var l=localStorage.getItem("${ADMIN_LANG_KEY}")==="ar"?"ar":"en";var t=localStorage.getItem("${ADMIN_THEME_KEY}");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";d.lang=l;d.dir=l==="ar"?"rtl":"ltr";d.setAttribute("data-admin-theme",t)}catch(e){}})()`;
