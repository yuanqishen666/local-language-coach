// Copy for the progress page and the five minutes before bed.
// Column order: zh-CN, en-US, es-419, fr-FR, ja-JP, de-DE, ko-KR, it-IT, pt-BR, hi-IN.
// A bar separates the singular from the plural where a language tells them apart.
type CopyRow = readonly [string, string, string, string, string, string, string, string, string, string]
const row = (...values: CopyRow) => values

export const progressCopy = {
  'nav.progress': row('进步', 'Progress', 'Progreso', 'Progrès', '上達', 'Fortschritt', '학습 현황', 'Progressi', 'Progresso', 'प्रगति'),

  // Amounts
  'progress.words': row('{count} 词', '{count} word | {count} words', '{count} palabra | {count} palabras', '{count} mot | {count} mots', '{count} 語', '{count} Wort | {count} Wörter', '{count}단어', '{count} parola | {count} parole', '{count} palavra | {count} palavras', '{count} शब्द'),
  'progress.characters': row('{count} 字', '{count} character | {count} characters', '{count} carácter | {count} caracteres', '{count} caractère | {count} caractères', '{count} 文字', '{count} Zeichen', '{count}자', '{count} carattere | {count} caratteri', '{count} caractere | {count} caracteres', '{count} अक्षर'),
  'progress.messages': row('{count} 条消息', '{count} message | {count} messages', '{count} mensaje | {count} mensajes', '{count} message | {count} messages', 'メッセージ {count} 件', '{count} Nachricht | {count} Nachrichten', '메시지 {count}개', '{count} messaggio | {count} messaggi', '{count} mensagem | {count} mensagens', '{count} संदेश'),

  // The weeks at a glance
  'progress.activity': row('近 {weeks} 周', 'Last {weeks} weeks', 'Últimas {weeks} semanas', '{weeks} dernières semaines', '直近 {weeks} 週間', 'Letzte {weeks} Wochen', '최근 {weeks}주', 'Ultime {weeks} settimane', 'Últimas {weeks} semanas', 'पिछले {weeks} हफ़्ते'),
  'progress.activeDays': row('练了 {count} 天', '{count} day practiced | {count} days practiced', '{count} día de práctica | {count} días de práctica', '{count} jour de pratique | {count} jours de pratique', '{count} 日練習', '{count} Übungstag | {count} Übungstage', '{count}일 연습', '{count} giorno di pratica | {count} giorni di pratica', '{count} dia de prática | {count} dias de prática', '{count} दिन अभ्यास'),
  'progress.empty': row('聊过之后，这里会记下每天的练习。', 'Your practice shows up here once you have had a conversation.', 'Tu práctica aparecerá aquí cuando tengas una conversación.', 'Votre pratique apparaîtra ici après une première conversation.', '会話をすると、ここに毎日の練習が記録されます。', 'Sobald du ein Gespräch geführt hast, erscheint deine Übung hier.', '대화를 하면 여기에 매일의 연습이 기록돼요.', 'La tua pratica comparirà qui dopo la prima conversazione.', 'Sua prática aparece aqui depois da primeira conversa.', 'पहली बातचीत के बाद आपका अभ्यास यहाँ दिखेगा।'),
  'progress.failed': row('进步记录没读出来。', 'Your progress could not be loaded.', 'No se pudo cargar tu progreso.', 'Impossible de charger vos progrès.', '記録を読み込めませんでした。', 'Dein Fortschritt konnte nicht geladen werden.', '기록을 불러오지 못했어요.', 'Impossibile caricare i tuoi progressi.', 'Não foi possível carregar seu progresso.', 'आपकी प्रगति लोड नहीं हो सकी।'),

  // The week in numbers
  'progress.thisWeek': row('本周', 'This week', 'Esta semana', 'Cette semaine', '今週', 'Diese Woche', '이번 주', 'Questa settimana', 'Esta semana', 'इस हफ़्ते'),
  'progress.lastWeek': row('上周', 'Last week', 'La semana pasada', 'La semaine dernière', '先週', 'Letzte Woche', '지난주', 'La settimana scorsa', 'Semana passada', 'पिछले हफ़्ते'),
  'progress.daysLabel': row('练习天数', 'Days practiced', 'Días de práctica', 'Jours de pratique', '練習した日', 'Übungstage', '연습한 날', 'Giorni di pratica', 'Dias de prática', 'अभ्यास के दिन'),
  'progress.conversationsLabel': row('对话', 'Conversations', 'Conversaciones', 'Conversations', '会話', 'Gespräche', '대화', 'Conversazioni', 'Conversas', 'बातचीत'),
  'progress.messagesLabel': row('你发的消息', 'Your messages', 'Tus mensajes', 'Vos messages', '送ったメッセージ', 'Deine Nachrichten', '보낸 메시지', 'I tuoi messaggi', 'Suas mensagens', 'आपके संदेश'),
  'progress.wordsLabel': row('词数', 'Words', 'Palabras', 'Mots', '語数', 'Wörter', '단어 수', 'Parole', 'Palavras', 'शब्द'),
  'progress.charactersLabel': row('字数', 'Characters', 'Caracteres', 'Caractères', '文字数', 'Zeichen', '글자 수', 'Caratteri', 'Caracteres', 'अक्षर'),
  'progress.weekBefore': row('前一周 {amount}', 'The week before: {amount}', 'La semana anterior: {amount}', 'La semaine d’avant : {amount}', '前の週は {amount}', 'Die Woche davor: {amount}', '그 전 주: {amount}', 'La settimana prima: {amount}', 'Na semana anterior: {amount}', 'उससे पिछले हफ़्ते: {amount}'),
  'progress.fewer': row('{kind}：从 {before} 次降到 {now} 次', '{kind}: down from {before} to {now}', '{kind}: bajó de {before} a {now}', '{kind} : passé de {before} à {now}', '{kind}：{before} 回から {now} 回に減りました', '{kind}: von {before} auf {now} gesunken', '{kind}: {before}번에서 {now}번으로 줄었어요', '{kind}: sceso da {before} a {now}', '{kind}: caiu de {before} para {now}', '{kind}: {before} से घटकर {now}'),
  'progress.firstUsed': row('第一次用上的词', 'Words you used for the first time', 'Palabras que usaste por primera vez', 'Mots utilisés pour la première fois', '初めて使えた単語', 'Zum ersten Mal benutzte Wörter', '처음으로 써 본 단어', 'Parole usate per la prima volta', 'Palavras que você usou pela primeira vez', 'पहली बार इस्तेमाल किए शब्द'),

  // Five minutes before bed
  'progress.bedtime': row('睡前 5 分钟', 'Five minutes before bed', 'Cinco minutos antes de dormir', 'Cinq minutes avant de dormir', '寝る前の5分', 'Fünf Minuten vor dem Schlafen', '자기 전 5분', 'Cinque minuti prima di dormire', 'Cinco minutos antes de dormir', 'सोने से पहले 5 मिनट'),
  'progress.bedtimeNote': row('聊聊今天，几句就收尾', 'Talk over your day; it wraps up after a few lines', 'Cuenta tu día; termina en pocas frases', 'Racontez votre journée ; quelques phrases et c’est fini', '今日のことを少し話して、すぐ終わります', 'Erzähl von deinem Tag; nach ein paar Sätzen ist Schluss', '오늘 하루를 몇 마디 나누고 마무리해요', 'Racconta la tua giornata; finisce in poche battute', 'Conte como foi seu dia; termina em poucas frases', 'आज के दिन की बात करें; कुछ वाक्यों में पूरी हो जाती है'),
  'progress.bedtimeSetting': row('睡前，安静地聊聊今天', 'Bedtime, a quiet chat about the day', 'Antes de dormir, una charla tranquila sobre el día', 'Avant de dormir, une conversation calme sur la journée', '寝る前に、今日のことを静かに話す', 'Vor dem Schlafen, ein ruhiges Gespräch über den Tag', '자기 전, 오늘 하루를 조용히 이야기해요', 'Prima di dormire, due chiacchiere tranquille sulla giornata', 'Antes de dormir, uma conversa tranquila sobre o dia', 'सोने से पहले, दिन के बारे में शांत बातचीत'),
  'progress.bedtimePartner': row('亲近的朋友', 'A close friend', 'Alguien cercano', 'Une personne proche', '親しい友人', 'Eine vertraute Person', '친한 친구', 'Una persona vicina', 'Uma pessoa próxima', 'एक क़रीबी दोस्त'),
  'progress.bedtimeTopic': row('今天过得怎么样', 'How today went', 'Cómo te fue hoy', 'Comment s’est passée la journée', '今日はどんな一日だったか', 'Wie der Tag war', '오늘 하루가 어땠는지', 'Com’è andata la giornata', 'Como foi o dia', 'आज का दिन कैसा रहा'),

} as const
