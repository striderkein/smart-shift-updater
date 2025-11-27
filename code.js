/**
 * Authorization: Bearer トークンを検証する共通関数
 * @obsoleted GAS ではヘッダが取得できない（ぇ
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {boolean}
 */
// function isAuthorized(e) {
//   const headers = e?.headers || {};
//   const authHeader = headers["authorization"] || headers["Authorization"] || "";
//   // --- 🔒 API_KEY チェック（Authorization: Bearer xxx） ---
//   const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
//   /** スクリプトプロパティから API_KEY を読み込む */
//   const API_KEY = PropertiesService.getScriptProperties().getProperty("API_KEY");

//   if (!token || token !== API_KEY) {
//     Logger.log("❌ 認証失敗: %s", token);
//     return false;
//   }
//   return true;
// }

/**
 * リクエスト内の API キーを検証する（POST JSON 形式）
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {boolean}
 */
function isAuthorized(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');
    const key = data.api_key;

    const API_KEY = PropertiesService.getScriptProperties().getProperty('API_KEY');

    if (key !== API_KEY) {
      Logger.log('❌ 認証失敗。送信されたキー: %s', key);
      return false;
    }

    Logger.log('✅ 認証成功');
    return true;
  } catch (error) {
    Logger.log('❌ JSON パース失敗: %s', error);
    return false;
  }
}

/**
 * 起動時に1ヶ月分の勤務予定をカレンダーに投入する
 */
function insertMonthlyWorkSchedule() {
  const calendar = CalendarApp.getDefaultCalendar();
  const now = new Date();

  for (let i = 0; i < 30; i++) {
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + i);

    const dayOfWeek = targetDate.getDay(); // 0:日曜, 6:土曜
    if (dayOfWeek === 0 || dayOfWeek === 6) continue; // 土日をスキップ

    const startTime = new Date(targetDate);
    startTime.setHours(9, 0, 0);

    const endTime = new Date(targetDate);
    endTime.setHours(18, 0, 0);

    // 同じタイトルの予定がすでにあるか確認
    const events = calendar.getEvents(startTime, endTime, { search: '出勤' });
    if (events.length === 0) {
      calendar.createEvent('出勤', startTime, endTime);
    }
  }

  Logger.log('1ヶ月分の出勤予定を登録しました');
}

/**
 * POST リクエストを受信した時刻を開始時刻として、
 * 当日の「出勤」予定の開始時刻を更新する
 * 認証にはリクエストボディ `api_key` を使用
 */
function doPost(e) {
  const now = new Date();
  Logger.log('【リクエスト受信】%s', now.toISOString());

  if (!isAuthorized(e)) {
    return ContentService.createTextOutput(`Unauthorized`).setMimeType(ContentService.MimeType.TEXT);
  }

  try {
    // リクエストボディから clock_in: 出勤, clock_out: 退勤 のいずれであるかを取得
    const data = JSON.parse(e.postData.contents || '{}');
    const action = data.action; // ここで action === undefined ならば catch される（ハズ）だからヘーキ

    // --- 📅 当日の出勤予定を取得・更新 ---
    const calendar = CalendarApp.getDefaultCalendar();
    const events = calendar.getEventsForDay(now);
    Logger.log('本日の予定数: %d', events.length);

    const targetTitle = '出勤';
    const targetEvent = events.find((event) => event.getTitle() === targetTitle);
    if (!targetEvent) {
      Logger.log('❌ 出勤予定が見つかりませんでした');
      return ContentService.createTextOutput('予定が見つかりません').setMimeType(ContentService.MimeType.TEXT);
    }

    if (action === 'clock_in') {
      Logger.log('🕒 出勤打刻: 開始時刻を %s に変更', now.toISOString());
      targetEvent.setTime(now, targetEvent.getEndTime());
      Logger.log('✅ 開始時刻を更新: %s', now.toLocaleTimeString('ja-JP'));
    } else {
      Logger.log('🕘 退勤打刻: 終了時刻を %s に変更', now.toISOString());
      targetEvent.setTime(targetEvent.getStartTime(), now);
      Logger.log('✅ 終了時刻を更新: %s', now.toLocaleTimeString('ja-JP'));
    }

    return ContentService.createTextOutput(
      `✅ ${action === 'clock_in' ? '出勤' : '退勤'}打刻しました (${now.toLocaleTimeString('ja-JP')})`
    ).setMimeType(ContentService.MimeType.TEXT);
  } catch (error) {
    Logger.log('⚠️ JSON パースエラー: %s', error);

    return ContentService.createTextOutput('JSON パースエラー').setMimeType(ContentService.MimeType.TEXT);
  }
}
