# פתיחת דלתות מקווה דרך ימות המשיח

פונקציית AWS Lambda שמחברת שלוחת API בימות המשיח למערכת מקווה.com.

- הקשה 1: פתיחת דלת חתם סופר
- הקשה 2: פתיחת דלת אתר רבקה

## התקנה
1. יוצרים פונקציית Lambda מסוג Node.js 20 ומעלים את `index.mjs`.
2. תחת Configuration ← Function URL יוצרים כתובת עם Auth type: NONE.
3. מגדירים משתני סביבה (Environment variables):

| משתנה | ערך |
|---|---|
| `MIKVEH_BASE` | `https://prod.xn--8dbba8a7b.com` |
| `SYSTEM_ID` | `2171` |
| `MIKVEH_USER` | שם משתמש |
| `MIKVEH_PASS` | סיסמה |
| `SECRET` | מחרוזת אקראית ארוכה |
| `ALLOWED_PHONES` | מספרים מורשים מופרדים בפסיק |
| `LOGIN_PATH` | נתיב ההתחברות (מכלי המפתחים) |
| `OPEN_PATH` | נתיב פתיחת הדלת עם `{id}` (מכלי המפתחים) |

## הגדרה בימות המשיח
בקובץ `ext.ini` של השלוחה:
```
type=api
api_link=https://YOUR-URL.lambda-url.REGION.on.aws/?key=YOUR_SECRET
```

## אבטחה
אל תשמרו סיסמאות בקוד או בריפוזיטורי. הכול נכנס רק במשתני הסביבה של הלמדה.
מומלץ למלא את `ALLOWED_PHONES` כדי שרק מספרים מורשים יוכלו לפתוח את הדלת.
