# CI Auto-Fix — متابعة CI بعد النشر وإصلاحه حتى النجاح بالكامل

أداة + مهارة (skill) تجعلها تحقق من GitHub Actions بعد كل نشر، وتصلح أي فشل، وتعاود النشر حتى تنجح كل الـ workflows بالكامل.

## الملفات

| الملف | الوظيفة |
|---|---|
| `tools/ci-watch.py` | سكربت متابعة: يراقب runs لنفس الـ SHA حتى تكتمل، يطبع خطوات فاشلة + ذيل اللوجز، exit code واضح. Stdlib فقط. |
| `.opencode/skills/ci-autofix/SKILL.md` | تعليمات الـ agent: حلقة `push → ci-watch → fix → push` ولا توقف إلا عند exit `0`. |

## التشغيل اليدوي

```sh
cd /root/projects/Atlas/atlas-cad-mobile
export GH_TOKEN=ghp_...          # توكن Actions: Read
git push origin main
python3 tools/ci-watch.py --sha "$(git rev-parse HEAD)"
```

Exit codes: `0` نجاح ، `1` فشل (اللوجز مطروحة) ، `2` ما زال يعمل/انتهى المهلة ، `3` مشكلة auth ، `4` لا يوجد run لهذا الـ SHA.

> **ملاحظة workflows:** `pages.yml` يعمل فقط عند تغيير `atlas-mobile/**` على `main`. `android-release.yml` يعمل عند تاج `v*` أو يدوياً. دفع بدون تغييرات مشمولة = صفر runs، وهذا ليس نجاحاً. الأداة تبلغك (`exit 4`) بدل ادعاء النجاح.

## حدود الأمان

المهارة تصلح أخطاء الكود/الاختبارات/البناء وتعاود النشر حتى 10 محاولات، لكنها **تتوقف وتبلّغ** عند: أخطاء secrets/صلاحيات/billing، أو تكرار نفس الخطأ 3 مرات. لا تحذف workflows ولا تعلّق الاختبارات ولا تستخدم `--force` — الإصلاح يجب أن يكون حقيقياً.
