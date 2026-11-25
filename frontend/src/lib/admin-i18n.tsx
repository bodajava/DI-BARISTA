"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

export type AdminLang = "en" | "ar";
export type AdminTheme = "light" | "dark";

import { DASHBOARD_AR } from "./admin/dict-ar";
import { ADMIN_LANG_KEY as LANG_KEY, ADMIN_THEME_KEY as THEME_KEY, ADMIN_PREFS_EVENT as EVENT } from "./admin-prefs-script";

function read(): string {
  if (typeof document === "undefined") return "en|dark";
  const d = document.documentElement;
  return `${d.lang === "ar" ? "ar" : "en"}|${d.getAttribute("data-admin-theme") === "light" ? "light" : "dark"}`;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

/** English source text -> Arabic. Anything missing falls back to English. */
const AR: Record<string, string> = {
  // Shell
  "Admin": "لوحة التحكم",
  "Overview": "نظرة عامة",
  "Products": "المنتجات",
  "Orders": "الطلبات",
  "Coupons": "الكوبونات",
  "Messages": "الرسائل",
  "Subscribers": "المشتركين",
  "Insights": "التحليلات",
  "AI Analyst": "المحلل الذكي",
  "Filter records…": "فلترة السجلات…",
  "Refresh": "تحديث",
  "Refresh live data": "تحديث البيانات",
  "Storefront": "المتجر",
  "Menu": "القائمة",
  "Sign out": "تسجيل الخروج",
  "Light mode": "الوضع الفاتح",
  "Dark mode": "الوضع الداكن",
  "Failed to load dashboard data": "تعذّر تحميل بيانات اللوحة",
  "Loading…": "جاري التحميل…",
  // Overview
  "Live store data · Cairo": "بيانات المتجر المباشرة · القاهرة",
  "Store overview": "نظرة على المتجر",
  "Ask the AI analyst →": "اسأل المحلل الذكي ←",
  "Today": "النهارده",
  "vs yesterday": "مقارنة بامبارح",
  "Last 30 days": "آخر ٣٠ يوم",
  "vs previous 30 days": "مقارنة بالـ٣٠ يوم اللي قبلها",
  "orders": "طلب",
  "To fulfil": "محتاجة تتجهّز",
  "Orders waiting to be roasted, packed or shipped": "طلبات مستنية تحميص أو تغليف أو شحن",
  "Customers": "العملاء",
  "repeat customers": "عملاء بيرجعوا يشتروا",
  "Total revenue": "إجمالي الإيراد",
  "settled orders": "طلبات مكتملة",
  "Average order": "متوسط الطلب",
  "items per order": "منتج في الطلب",
  "Cancellation rate": "نسبة الإلغاء",
  "Last 30 days, incl. refunds": "آخر ٣٠ يوم، شامل المرتجع",
  "Abandoned online payments": "مدفوعات أونلاين متكمّلتش",
  "Sales trend": "اتجاه المبيعات",
  "No sales recorded yet.": "مفيش مبيعات متسجّلة لسه.",
  "Revenue by payment method": "الإيراد حسب طريقة الدفع",
  "Top governorates": "أكتر المحافظات",
  "Revenue by category": "الإيراد حسب القسم",
  "Low stock": "مخزون قليل",
  "Everything is well stocked.": "كل المنتجات مخزونها كويس.",
  "left": "متبقي",
  "Audience": "الجمهور",
  "Newsletter subscribers": "المشتركين في النشرة",
  "new in 30 days": "جديد في ٣٠ يوم",
  "Unread messages": "رسائل جديدة",
  "Open": "افتح",
  "Coupon usage": "استخدام الكوبونات",
  "of orders used a coupon": "من الطلبات استخدمت كوبون",
  "Total discounts given": "إجمالي الخصومات",
  "When customers order": "العملاء بيطلبوا إمتى",
  "By hour (Cairo time)": "حسب الساعة (توقيت القاهرة)",
  "By day of week": "حسب يوم الأسبوع",
  "Cash on delivery": "كاش عند الاستلام",
  "Card": "كارت",
  "Mobile wallet": "محفظة موبايل",
  "No data yet.": "مفيش بيانات لسه.",
  "Sun": "الأحد",
  "Mon": "الاتنين",
  "Tue": "التلات",
  "Wed": "الأربع",
  "Thu": "الخميس",
  "Fri": "الجمعة",
  "Sat": "السبت",
  // Insights tab
  "Products & customers": "المنتجات والعملاء",
  "Best sellers, slow movers, product views and your top customers": "الأكثر مبيعًا، المنتجات البطيئة، المشاهدات، وأهم عملائك",
  "Best sellers": "الأكثر مبيعًا",
  "Slow movers (many views, few sales)": "منتجات بطيئة (مشاهدات كتير ومبيعات قليلة)",
  "Product": "المنتج",
  "Units": "الوحدات",
  "Revenue": "الإيراد",
  "Views / sold": "مشاهدات / مبيعات",
  "Drop-off": "نسبة الفقد",
  "Stock": "المخزون",
  "Product views & conversion": "مشاهدات المنتجات والتحويل",
  "Views": "المشاهدات",
  "Sold": "المبيعات",
  "Conversion": "التحويل",
  "Top customers": "أهم العملاء",
  "Repeat": "متكرر",
  "One-time": "مرة واحدة",
  "Customer": "العميل",
  "Segment": "الشريحة",
  "Total spend": "إجمالي الإنفاق",
  "REPEAT_BUYER": "عميل متكرر",
  "ONE_TIME_BUYER": "عميل مرة واحدة",
  // Orders
  "Sales & order fulfilment": "المبيعات وتجهيز الطلبات",
  "Order #": "رقم الطلب",
  "Payment": "الدفع",
  "Total (EGP)": "الإجمالي (ج.م)",
  "Total": "الإجمالي",
  "Fulfilment status": "حالة التجهيز",
  "Tracker stage": "مرحلة التتبع",
  "Inspect": "تفاصيل",
  "Inspect order & payment": "تفاصيل الطلب والدفع",
  "Refund & restore stock": "استرجاع الفلوس وإرجاع المخزون",
  "Refund this order? This cannot be undone.": "استرجاع فلوس الطلب ده؟ مينفعش التراجع.",
  "Failed to update order status": "تعذّر تحديث حالة الطلب",
  "Unable to refund order": "تعذّر استرجاع الطلب",
  "Failed to fetch order details": "تعذّر تحميل تفاصيل الطلب",
  "ALL": "الكل",
  "PENDING": "قيد الانتظار",
  "PENDING_PAYMENT": "مستني الدفع",
  "PAID": "مدفوع",
  "PROCESSING": "بيتجهّز",
  "ROASTING": "بيتحمّص",
  "PACKING": "بيتغلّف",
  "OUT_FOR_DELIVERY": "في الطريق",
  "SHIPPED": "اتشحن",
  "DELIVERED": "اتسلّم",
  "CANCELLED": "ملغي",
  "REFUNDED": "مسترجع",
  "SUCCESS": "ناجح",
  "FAILED": "فشل",
  "INITIATED": "بدأ",
  "CASH_ON_DELIVERY": "كاش عند الاستلام",
  "PAYMOB_CARD": "كارت",
  "MOBILE_WALLET": "محفظة",
  "No orders yet.": "مفيش طلبات لسه.",
  "Close": "إغلاق",
  "Items": "المنتجات",
  "Shipping address": "عنوان الشحن",
  "Notes": "ملاحظات",
  "Payment record": "سجل الدفع",
  // Products
  "Coffee catalog": "كتالوج القهوة",
  "New product": "منتج جديد",
  "Create product": "إضافة منتج",
  "Update product": "تحديث المنتج",
  "Saving…": "جاري الحفظ…",
  "Failed to save product": "تعذّر حفظ المنتج",
  "Price (EGP)": "السعر (ج.م)",
  "Roast": "التحميص",
  "SKU": "الكود",
  "Sold / views": "مبيعات / مشاهدات",
  "Status": "الحالة",
  "Actions": "إجراءات",
  "Active on public storefront": "ظاهر في المتجر",
  "Delete this product?": "حذف المنتج ده؟",
  "Edit": "تعديل",
  "Delete": "حذف",
  "Cancel": "إلغاء",
  "ACTIVE": "نشط",
  "DRAFT": "مسودة",
  "OUT_OF_STOCK": "نفد",
  "Product name": "اسم المنتج",
  "Arabic name": "الاسم بالعربي",
  "Brand": "البراند",
  "Category": "القسم",
  "Discount (%)": "الخصم (٪)",
  "Weight (g)": "الوزن (جم)",
  "Roast level": "درجة التحميص",
  "Origin": "المنشأ",
  "Available grinds": "أنواع الطحن المتاحة",
  "Flavour notes (comma separated)": "النكهات (افصل بفاصلة)",
  "Image URLs (one per line)": "روابط الصور (كل رابط في سطر)",
  "Description": "الوصف",
  "Product photos": "صور المنتج",
  "Cover": "الغلاف",
  "Make cover": "خليها الأولى",
  "Upload": "رفع",
  "Only JPG, PNG, WEBP or AVIF images": "الصور لازم تكون JPG أو PNG أو WEBP أو AVIF",
  "Each image must be 5 MB or less": "كل صورة لازم تكون ٥ ميجا أو أقل",
  "Drag photos here or click Upload. JPG, PNG, WEBP or AVIF, up to 5 MB each, 5 per save. The first photo is the cover.": "اسحب الصور هنا أو دوس رفع. JPG أو PNG أو WEBP أو AVIF، لحد ٥ ميجا للصورة و٥ صور في كل حفظ. أول صورة هي الغلاف.",
  // Coupons
  "Coupons & promotions": "الكوبونات والعروض",
  "Code": "الكود",
  "Discount": "الخصم",
  "Min order": "أقل طلب",
  "Min order (EGP):": "أقل طلب (ج.م):",
  "Redemptions": "مرات الاستخدام",
  "Expires": "ينتهي",
  "Remove": "حذف",
  "Create": "إنشاء",
  "Creating…": "جاري الإنشاء…",
  "PERCENTAGE (%)": "نسبة (٪)",
  "FIXED (EGP)": "مبلغ ثابت (ج.م)",
  "PAUSED": "متوقف",
  "Type": "النوع",
  "Value": "القيمة",
  "Usage limit": "حد الاستخدام",
  "Failed to create coupon": "تعذّر إنشاء الكوبون",
  "Unable to create coupon": "تعذّر إنشاء الكوبون",
  "Delete this coupon?": "حذف الكوبون ده؟",
  "Email a coupon to customers": "ابعت كوبون للعملاء بالإيميل",
  "Coupon": "الكوبون",
  "Send to": "ابعت لـ",
  "All past buyers": "كل اللي اشتروا قبل كده",
  "Repeat buyers": "العملاء المتكررين",
  "One-time buyers": "اللي اشتروا مرة واحدة",
  "Custom list": "قائمة مخصصة",
  "Email language": "لغة الإيميل",
  "Optional message shown above the code": "رسالة اختيارية فوق الكود",
  "Only these recipients can use the code": "الكود يشتغل للناس دي بس",
  "Send this coupon by email now?": "تبعت الكوبون ده بالإيميل دلوقتي؟",
  "Send": "ابعت",
  "Sending…": "جاري الإرسال…",
  "Sent": "اتبعت",
  "Sending failed": "الإرسال فشل",
  // Subscribers / messages
  "People who entered their email in “Subscribe now” on the store.": "الناس اللي سجّلت إيميلها في «اشترك دلوقتي» في المتجر.",
  "total": "إجمالي",
  "Export CSV": "تصدير CSV",
  "Email": "الإيميل",
  "Language": "اللغة",
  "Signed up": "تاريخ الاشتراك",
  "SUBSCRIBED": "مشترك",
  "REMOVED": "اتشال",
  "No subscribers yet.": "مفيش مشتركين لسه.",
  "Prev": "السابق",
  "Next": "التالي",
  "Customer messages": "رسائل العملاء",
  "new": "جديدة",
  "Sent from the contact form in the store footer. Opening a message marks it as read.": "اتبعتت من نموذج التواصل في آخر المتجر. فتح الرسالة بيعلّمها كمقروءة.",
  "All": "الكل",
  "New": "جديدة",
  "Read": "مقروءة",
  "Archived": "مؤرشفة",
  "No messages here.": "مفيش رسائل هنا.",
  "Reply by email": "رد بالإيميل",
  "Mark unread": "علّمها غير مقروءة",
  "Archive": "أرشفة",
  // Login
  "Admin sign in": "دخول لوحة التحكم",
  "Sign in to manage orders, products and customers.": "سجّل دخول علشان تدير الطلبات والمنتجات والعملاء.",
  "Password": "كلمة السر",
  "Sign in": "تسجيل الدخول",
  "Signing in…": "جاري الدخول…",
  "Invalid admin credentials": "بيانات الدخول غلط",
  "Unable to reach authentication service": "تعذّر الوصول لخدمة الدخول",
  "Back to the store": "ارجع للمتجر",
};

type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

/** Arabic plural forms: one | two | few (3–10) | many (11+); zero uses "many" */
function arabicForm(forms: string[], n: number): string {
  const [one, two, few, many] = forms;
  if (n === 1) return one;
  if (n === 2) return two ?? many ?? one;
  const mod = n % 100;
  if (mod >= 3 && mod <= 10) return few ?? many ?? one;
  return many ?? few ?? one;
}

type Ctx = {
  lang: AdminLang;
  theme: AdminTheme;
  dir: "ltr" | "rtl";
  /** English source text (with optional {vars}) → current language */
  t: (en: string, vars?: Vars) => string;
  /** Counted text: key "{n} order|{n} orders"; Arabic entry "one|two|few|many" */
  tn: (key: string, n: number, vars?: Vars) => string;
  dateOnly: (iso?: string | null) => string;
  time: (iso?: string | null) => string;
  ago: (iso?: string | null) => string;
  setLang: (lang: AdminLang) => void;
  setTheme: (theme: AdminTheme) => void;
  money: (cents: number | null | undefined) => string;
  num: (n: number | null | undefined, digits?: number) => string;
  pct: (ratio: number | null | undefined) => string;
  date: (iso?: string | null) => string;
};

const AdminPrefsContext = createContext<Ctx | null>(null);

export function AdminPrefsProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, read, () => "en|dark");
  const [lang, theme] = snapshot.split("|") as [AdminLang, AdminTheme];

  const apply = useCallback((nextLang: AdminLang, nextTheme: AdminTheme) => {
    const d = document.documentElement;
    d.lang = nextLang;
    d.dir = nextLang === "ar" ? "rtl" : "ltr";
    d.setAttribute("data-admin-theme", nextTheme);
    try {
      localStorage.setItem(LANG_KEY, nextLang);
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch {
      // private mode: the choice lasts for this page only
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const value = useMemo<Ctx>(() => {
    const intl = lang === "ar" ? "ar-EG-u-nu-latn" : "en-EG";
    return {
      lang,
      theme,
      dir: lang === "ar" ? "rtl" : "ltr",
      t: (en, vars) => fill(lang === "ar" ? DASHBOARD_AR[en] ?? AR[en] ?? en : en, vars),
      tn: (key, n, vars) => {
        const all = { n: Number(n).toLocaleString(intl), ...vars };
        if (lang === "ar") {
          const entry = DASHBOARD_AR[key];
          if (entry) return fill(arabicForm(entry.split("|"), n), all);
        }
        const [one, other] = key.split("|");
        return fill(n === 1 ? one : other ?? one, all);
      },
      dateOnly: (iso) => (iso ? new Date(iso).toLocaleDateString(intl, { dateStyle: "medium" }) : "—"),
      time: (iso) => (iso ? new Date(iso).toLocaleTimeString(intl, { timeStyle: "short" }) : "—"),
      ago: (iso) => {
        if (!iso) return "—";
        const rtf = new Intl.RelativeTimeFormat(intl, { numeric: "auto" });
        const diff = (new Date(iso).getTime() - Date.now()) / 1000;
        const abs = Math.abs(diff);
        if (abs < 60) return rtf.format(Math.round(diff), "second");
        if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
        if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
        return rtf.format(Math.round(diff / 86400), "day");
      },
      setLang: (next) => apply(next, theme),
      setTheme: (next) => apply(lang, next),
      // One format everywhere: "1,250 EGP" / "1,250 ج.م" (Latin digits in both languages)
      money: (cents) => {
        const value = Number(cents || 0) / 100;
        const text = Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: value % 1 ? 2 : 0 });
        return `${value < 0 ? "−" : ""}${text} ${lang === "ar" ? "ج.م" : "EGP"}`;
      },
      num: (n, digits = 0) =>
        Number(n || 0).toLocaleString(intl, { maximumFractionDigits: digits, minimumFractionDigits: digits }),
      pct: (ratio) =>
        Number(ratio || 0).toLocaleString(intl, { style: "percent", maximumFractionDigits: 1 }),
      date: (iso) => (iso ? new Date(iso).toLocaleString(intl, { dateStyle: "medium", timeStyle: "short" }) : "—"),
    };
  }, [lang, theme, apply]);

  return <AdminPrefsContext.Provider value={value}>{children}</AdminPrefsContext.Provider>;
}

export function useAdmin(): Ctx {
  const ctx = useContext(AdminPrefsContext);
  if (!ctx) throw new Error("useAdmin must be used inside <AdminPrefsProvider>");
  return ctx;
}
