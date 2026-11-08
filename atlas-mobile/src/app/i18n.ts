import { create } from 'zustand';

export type Lang = 'en' | 'ar';

const AR: Record<string, string> = {
  // dock & navigation
  Layers: 'الطبقات', Draw: 'رسم', Edit: 'تعديل', Text: 'نصوص', Search: 'بحث', Measure: 'قياس', GPS: 'GPS', Update: 'تحديث', More: 'المزيد',
  // panel titles
  'Layer Manager': 'إدارة الطبقات', Properties: 'الخصائص', Modify: 'تعديل', 'Calibration Wizard': 'معالج المعايرة',
  Export: 'تصدير', Project: 'المشروع', Versions: 'الإصدارات', Settings: 'الإعدادات', 'Software Update': 'تحديث البرنامج',
  'Users, Roles & Audit': 'المستخدمين والصلاحيات والسجل', 'Cloud Sync': 'المزامنة السحابية',
  'Users & roles': 'المستخدمين والصلاحيات', Calibration: 'المعايرة',
  // top bar / canvas
  DESIGN: 'تصميم', 'AS-BUILT': 'تنفيذ فعلي', 'GPS off': 'GPS متوقف', 'Searching…': 'جاري البحث عن الأقمار…', 'not calibrated': 'غير معاير',
  'GPS error': 'خطأ GPS', 'Fit drawing': 'عرض الرسم كاملًا', 'Locate me / Follow me': 'حدد موقعي / تتبعني',
  'Paper space · view only': 'مساحة الورق · عرض فقط', Model: 'النموذج', Done: 'تم',
  // start screen
  'ATLAS CAD — your DWG is the map.': 'ATLAS CAD — ملف الـDWG هو الخريطة.',
  'Open DWG / DXF': 'فتح DWG / DXF', 'New blank project': 'مشروع جديد فارغ', Projects: 'المشاريع', 'No projects yet.': 'لا توجد مشاريع بعد.',
  'Add drawing': 'إضافة رسم',
  'Drop a DWG or DXF file here. The original is stored read-only; you always edit a project copy.': 'اسحب ملف DWG أو DXF هنا. يتم حفظ الملف الأصلي للقراءة فقط وتتم التعديلات دائمًا على نسخة المشروع.',
  // common actions
  Start: 'تشغيل', Stop: 'إيقاف', Save: 'حفظ', Cancel: 'إلغاء', Delete: 'حذف', Close: 'إغلاق', Apply: 'تطبيق', Zoom: 'تكبير',
  'Locate me': 'حدد موقعي', 'Follow me': 'تتبعني', 'North up': 'الشمال لأعلى', 'Heading up': 'الاتجاه لأعلى',
  'Start tracking': 'بدء تسجيل المسار', 'Calibration wizard': 'معالج المعايرة', 'Auto-detect CRS': 'اكتشاف نظام الإحداثيات تلقائيًا',
  Navigate: 'ملاحة', 'Navigate to': 'الملاحة إلى', 'Arrived ✓': 'وصلت ✓',
  Distance: 'مسافة', Area: 'مساحة', Angle: 'زاوية', 'Object ↔ Object': 'بين عنصرين',
  'P Coordinates': 'إحداثيات نقطة', Coords: 'إحداثيات', 'Object length': 'طول عنصر',
  Language: 'اللغة', 'Show lineweights': 'إظهار سمك الخطوط', 'Dark canvas (ACI 7 = white)': 'خلفية داكنة',
  'All projects': 'كل المشاريع', 'Save version': 'حفظ إصدار', Undo: 'تراجع', Redo: 'إعادة',
  Line: 'خط', Polyline: 'خط متعدد', Arc: 'قوس', Circle: 'دائرة', Rectangle: 'مستطيل', Triangle: 'مثلث', Polygon: 'مضلع', Ellipse: 'قطع ناقص',
  Cloud: 'سحابة', Arrow: 'سهم', Freehand: 'رسم حر', Point: 'نقطة', Hatch: 'تهشير', Leader: 'سهم توضيحي', MText: 'نص متعدد', 'Edit text': 'تعديل نص',
  Move: 'نقل', Copy: 'نسخ', Rotate: 'تدوير', Mirror: 'انعكاس', Scale: 'تحجيم', Stretch: 'مط', Trim: 'قص', Extend: 'مد', Offset: 'إزاحة',
  Fillet: 'تقويس', Chamfer: 'شطف', Explode: 'تفكيك', Join: 'دمج', Break: 'كسر', 'Edit Polyline': 'تعديل الخط المتعدد', 'Match Props': 'مطابقة الخصائص',
  'Copy (clip)': 'نسخ للحافظة', Paste: 'لصق',
  'Tap to place · long-press for precision loupe · 2 fingers to zoom': 'اضغط لوضع النقطة · ضغطة مطولة للعدسة الدقيقة · إصبعين للتكبير',
};

export const useLang = create<{ lang: Lang; set: (l: Lang) => void }>((set) => ({
  lang: (() => { try { return (localStorage.getItem('fl.lang') as Lang) || 'en'; } catch { return 'en'; } })(),
  set: (lang) => { try { localStorage.setItem('fl.lang', lang); } catch { /* ignore */ } set({ lang }); applyDir(lang); },
}));

function applyDir(lang: Lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}
applyDir(useLang.getState().lang);

/** translate a UI string (English is the source language and the key) */
export function t(s: string): string {
  return useLang.getState().lang === 'ar' ? AR[s] ?? s : s;
}

/** hook variant that re-renders on language change */
export function useT() {
  useLang((s) => s.lang);
  return t;
}
