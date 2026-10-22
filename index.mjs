// AWS Lambda (Node.js 22) + Function URL
// מערכת טלפונית לימות המשיח: הקשה 1 = דלת חתם סופר, הקשה 2 = דלת אתר רבקה
//
// משתני סביבה (Environment Variables) להגדיר בלמדה:
//   MIKVEH_USER      שם המשתמש במערכת מקווה.com
//   MIKVEH_PASS      הסיסמה
//   SYSTEM_ID        2171
//   SECRET           מחרוזת אקראית ארוכה (נכנסת גם לקישור api_link בימות)
//   ALLOWED_PHONES   מספרים מורשים לפתיחה, מופרדים בפסיק (למשל 0501234567,0527654321). ריק = כולם

const BASE = 'https://prod.xn--8dbba8a7b.com';
const OPEN_URL = BASE + '/Terminal/TerminalAction';
const LOGIN_URL = BASE + '/Account';
const SECRET = process.env.SECRET || '';
// מנרמל מספר טלפון: משאיר רק ספרות, והופך 972 בהתחלה ל-0
// כך 058-321-0422, 0583210422, +972583210422 ו-972583210422 נחשבים אותו מספר
const normPhone = s => {
  const d = String(s || '').replace(/\D/g, '');
  return d.startsWith('972') ? '0' + d.slice(3) : d;
};
const ALLOWED = (process.env.ALLOWED_PHONES || '')
  .split(/[,;\s]+/).map(normPhone).filter(Boolean);

// הנתונים של שתי הדלתות, כפי שנשלחים מהאתר בלחיצה על "פתיחת דלת פעם אחת"
// אם מתברר שהדלתות הפוכות, מחליפים בין הערכים של 1 ו-2
const DOORS = {
  '1': {
    name: 'חתם סופר',
    terminalId: 'd3f11940-3075-4de4-beaf-f4210ff2f14f',
    targetId: '6C4B9024BFE7',
  },
  '2': {
    name: 'אתר רבקה',
    terminalId: '3289ef11-cf0a-47d6-8264-d1940028e877',
    targetId: '98FA9B102524',
  },
};

const MENU = 'read=t-לפתיחת דלת חתם סופר הקישו 1 לפתיחת דלת אתר רבקה הקישו 2=Door,no,1,1,7,No';

// הטוקן נשמר בזיכרון בין שיחות כל עוד הלמדה "חמה"
let token = null;
let tokenExp = 0;

// קורא את זמן התפוגה מתוך הטוקן עצמו (JWT)
function jwtExp(t) {
  try {
    return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).exp * 1000;
  } catch { return 0; }
}

async function getToken() {
  // שימוש בטוקן קיים אם הוא עוד בתוקף לפחות 5 דקות
  if (token && Date.now() < tokenExp - 5 * 60 * 1000) return token;

  // התחברות עם שם משתמש וסיסמה, בדיוק כמו במסך הכניסה של האתר
  const res = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
      Origin: BASE,
      Referer: BASE + '/adminUi/',
    },
    body: JSON.stringify({
      username: process.env.MIKVEH_USER,
      password: process.env.MIKVEH_PASS,
      externalClubId: process.env.SYSTEM_ID || '2171',
    }),
  });
  if (!res.ok) throw new Error('login failed ' + res.status);
  const text = await res.text();
  // מחפשים בתשובה את הטוקן (מחרוזת JWT שמתחילה ב-eyJ), לא משנה באיזה שדה הוא נמצא
  const m = text.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
  if (!m) throw new Error('no token in login response: ' + text.slice(0, 200));
  token = m[0];
  tokenExp = jwtExp(token) || Date.now() + 60 * 60 * 1000;
  return token;
}

async function openDoor(door, retry = true) {
  const t = await getToken();
  const res = await fetch(OPEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
      Authorization: 'Bearer ' + t,
      Origin: BASE,
      Referer: BASE + '/adminUi/',
    },
    body: JSON.stringify({
      terminalId: door.terminalId,
      targetId: door.targetId,
      actionName: 'openGate',
      data: '',
    }),
  });
  // אם הטוקן פג, מתחברים מחדש ומנסים פעם נוספת
  if (res.status === 401 && retry) { token = null; return openDoor(door, false); }
  if (!res.ok) throw new Error('open failed ' + res.status + ' ' + (await res.text()).slice(0, 200));
}

function reply(text) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: text,
  };
}

export const handler = async (event) => {
  // ימות המשיח שולחת GET כברירת מחדל, אבל נתמך גם POST
  const p = { ...(event.queryStringParameters || {}) };
  if (event.body) {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body;
    for (const [k, v] of new URLSearchParams(raw)) p[k] = v;
  }

  // רישום ביומן מה הגיע מימות המשיח (בלי המפתח הסודי), לצורך בדיקת תקלות
  const { key: _k, ...logged } = p;
  console.log('request', JSON.stringify(logged));

  // בדיקת המפתח הסודי
  if (SECRET && p.key !== SECRET) return { statusCode: 403, body: 'forbidden' };
  // המתקשר ניתק
  if (p.hangup === 'yes') return reply('');

  // בדיקה שהמספר המתקשר מורשה
  const phone = normPhone(p.ApiPhone);
  if (ALLOWED.length && !ALLOWED.includes(phone)) {
    console.log('blocked phone', phone, 'allowed:', ALLOWED.join(','));
    return reply('id_list_message=t-אין הרשאה לפתיחת הדלת&go_to_folder=hangup');
  }

  const door = DOORS[p.Door];
  if (!p.Door) return reply(MENU);                                       // השמעת התפריט
  if (!door) return reply('id_list_message=t-הקשה שגויה&' + MENU);       // הקשה לא חוקית

  try {
    await openDoor(door);
    console.log('opened', door.name, 'by', phone);
    return reply(`id_list_message=t-הדלת של ${door.name} נפתחה&go_to_folder=hangup`);
  } catch (e) {
    console.error(e);
    return reply('id_list_message=t-אירעה תקלה בפתיחת הדלת נסו שוב מאוחר יותר&go_to_folder=hangup');
  }
};
