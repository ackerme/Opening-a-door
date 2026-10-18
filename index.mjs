// AWS Lambda (Node.js 20 ומעלה) + Function URL
// מערכת טלפונית לימות המשיח: הקשה 1 = דלת חתם סופר, הקשה 2 = דלת אתר רבקה
//
// משתני סביבה (Environment Variables) להגדיר בלמדה:
//   MIKVEH_BASE      https://prod.xn--8dbba8a7b.com   (הדומיין של מקווה.com בכתיב punycode)
//   SYSTEM_ID        2171
//   MIKVEH_USER      שם המשתמש
//   MIKVEH_PASS      הסיסמה
//   SECRET           מחרוזת אקראית ארוכה (נכנסת גם לקישור api_link בימות)
//   ALLOWED_PHONES   מספרים מורשים לפתיחה, מופרדים בפסיק (למשל 0501234567,0527654321). ריק = כולם
//   LOGIN_PATH       נתיב ההתחברות (לוקחים מכלי המפתחים, ראו הסבר)
//   OPEN_PATH        נתיב פתיחת הדלת, עם {id} במקום מספר המסוף (לוקחים מכלי המפתחים)

const BASE = process.env.MIKVEH_BASE || 'https://prod.xn--8dbba8a7b.com';
const LOGIN_PATH = process.env.LOGIN_PATH || '/TODO/login';
const OPEN_PATH = process.env.OPEN_PATH || '/TODO/terminals/{id}/open';
const SECRET = process.env.SECRET || '';
const ALLOWED = (process.env.ALLOWED_PHONES || '')
  .split(',').map(s => s.trim()).filter(Boolean);

// מספרי המסופים כפי שמופיעים ברשימה: (1) אתר רבקה, (2) חתם סופר
const DOORS = {
  '1': { name: 'חתם סופר', terminalId: process.env.TERMINAL_CHATAM_SOFER || '2' },
  '2': { name: 'אתר רבקה', terminalId: process.env.TERMINAL_ATERET_RIVKA || '1' },
};

const MENU = 'read=t-לפתיחת דלת חתם סופר הקישו 1 לפתיחת דלת אתר רבקה הקישו 2=Door,no,1,1,7,No';

// הטוקן נשמר בזיכרון בין שיחות כל עוד הלמדה "חמה"
let token = null;
let tokenTime = 0;

async function login() {
  if (token && Date.now() - tokenTime < 20 * 60 * 1000) return token;
  // לתקן: להתאים את גוף הבקשה למה שהאתר באמת שולח בהתחברות
  const res = await fetch(BASE + LOGIN_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemId: process.env.SYSTEM_ID,
      username: process.env.MIKVEH_USER,
      password: process.env.MIKVEH_PASS,
    }),
  });
  if (!res.ok) throw new Error('login failed ' + res.status);
  const data = await res.json().catch(() => ({}));
  // לתקן: להתאים לשם השדה שבו חוזר הטוקן (או עוגייה)
  token = data.token || data.access_token || res.headers.get('set-cookie');
  tokenTime = Date.now();
  return token;
}

async function openDoor(terminalId, retry = true) {
  const t = await login();
  const res = await fetch(BASE + OPEN_PATH.replace('{id}', terminalId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // לתקן: אם האתר משתמש בעוגייה ולא ב-Bearer, לשנות ל: Cookie: t
      Authorization: 'Bearer ' + t,
    },
    body: '{}',
  });
  if (res.status === 401 && retry) { token = null; return openDoor(terminalId, false); }
  if (!res.ok) throw new Error('open failed ' + res.status);
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

  // בדיקת המפתח הסודי
  if (SECRET && p.key !== SECRET) return { statusCode: 403, body: 'forbidden' };
  // המתקשר ניתק
  if (p.hangup === 'yes') return reply('');

  // בדיקה שהמספר המתקשר מורשה
  const phone = (p.ApiPhone || '').replace(/^\+?972/, '0');
  if (ALLOWED.length && !ALLOWED.includes(phone)) {
    return reply('id_list_message=t-אין הרשאה לפתיחת הדלת&go_to_folder=hangup');
  }

  const door = DOORS[p.Door];
  if (!p.Door) return reply(MENU);                                       // השמעת התפריט
  if (!door) return reply('id_list_message=t-הקשה שגויה&' + MENU);       // הקשה לא חוקית

  try {
    await openDoor(door.terminalId);
    console.log('opened', door.name, 'by', phone);
    return reply(`id_list_message=t-הדלת של ${door.name} נפתחה&go_to_folder=hangup`);
  } catch (e) {
    console.error(e);
    return reply('id_list_message=t-אירעה תקלה בפתיחת הדלת נסו שוב מאוחר יותר&go_to_folder=hangup');
  }
};
