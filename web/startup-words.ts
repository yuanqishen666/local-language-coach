import { UI_LOCALES, type UiLocale } from '../shared/locales'

type Row = readonly [string, string, string, string, string, string, string, string, string, string]
const row = (...values: Row) => values

/** Said in place of the app when it cannot start, so before it can say which language it was set to. */
const startup = {
  busyTitle: row('已在另一个标签页打开', 'Already open in another tab', 'Ya está abierta en otra pestaña', 'Déjà ouverte dans un autre onglet', '別のタブで開いています', 'Bereits in einem anderen Tab geöffnet', '이미 다른 탭에서 열려 있어요', 'Già aperta in un’altra scheda', 'Já está aberto em outra aba', 'पहले से दूसरे टैब में खुला है'),
  busyBody: row(
    '数据存在这个浏览器里，同一时间只能有一个标签页使用。关掉另一个标签页后再试。',
    'Your data is kept in this browser, and one tab at a time can use it. Close the other tab, then try again.',
    'Tus datos se guardan en este navegador y solo una pestaña puede usarlos a la vez. Cierra la otra pestaña y vuelve a intentarlo.',
    'Vos données sont conservées dans ce navigateur, et un seul onglet à la fois peut les utiliser. Fermez l’autre onglet, puis réessayez.',
    'データはこのブラウザに保存されていて、同時に使えるタブは1つだけです。もう一方のタブを閉じてから、もう一度お試しください。',
    'Deine Daten liegen in diesem Browser, und nur ein Tab kann sie gleichzeitig nutzen. Schließe den anderen Tab und versuche es dann erneut.',
    '데이터는 이 브라우저에 저장되며 한 번에 한 탭에서만 쓸 수 있어요. 다른 탭을 닫고 다시 시도해 주세요.',
    'I tuoi dati sono conservati in questo browser e può usarli una sola scheda alla volta. Chiudi l’altra scheda e riprova.',
    'Seus dados ficam neste navegador, e só uma aba por vez pode usá-los. Feche a outra aba e tente de novo.',
    'आपका डेटा इसी ब्राउज़र में रहता है और एक समय में एक ही टैब उसे इस्तेमाल कर सकता है। दूसरा टैब बंद करके दोबारा कोशिश करें।',
  ),
  unsupportedTitle: row('这个浏览器存不了数据', 'This browser cannot keep your data', 'Este navegador no puede guardar tus datos', 'Ce navigateur ne peut pas conserver vos données', 'このブラウザではデータを保存できません', 'Dieser Browser kann deine Daten nicht speichern', '이 브라우저에는 데이터를 저장할 수 없어요', 'Questo browser non può conservare i tuoi dati', 'Este navegador não consegue guardar seus dados', 'यह ब्राउज़र आपका डेटा नहीं रख सकता'),
  unsupportedBody: row(
    '这里的数据要存在浏览器里。请换用较新版本的 Chrome、Edge、Safari 或 Firefox，并且不要用无痕窗口。',
    'The app keeps its data in the browser. Use a recent Chrome, Edge, Safari or Firefox, outside a private window.',
    'La aplicación guarda sus datos en el navegador. Usa una versión reciente de Chrome, Edge, Safari o Firefox, fuera de una ventana privada.',
    'L’application conserve ses données dans le navigateur. Utilisez une version récente de Chrome, Edge, Safari ou Firefox, hors navigation privée.',
    'このアプリはデータをブラウザに保存します。新しいバージョンの Chrome、Edge、Safari、Firefox を、プライベートウィンドウ以外でお使いください。',
    'Die App speichert ihre Daten im Browser. Nutze ein aktuelles Chrome, Edge, Safari oder Firefox, nicht in einem privaten Fenster.',
    '이 앱은 데이터를 브라우저에 저장해요. 최신 버전의 Chrome, Edge, Safari 또는 Firefox를 시크릿 창이 아닌 일반 창에서 사용해 주세요.',
    'L’app conserva i dati nel browser. Usa una versione recente di Chrome, Edge, Safari o Firefox, non in una finestra privata.',
    'O app guarda os dados no navegador. Use uma versão recente do Chrome, Edge, Safari ou Firefox, fora de uma janela privada.',
    'यह ऐप अपना डेटा ब्राउज़र में रखता है। Chrome, Edge, Safari या Firefox का नया संस्करण इस्तेमाल करें, निजी विंडो के बाहर।',
  ),
  failedTitle: row('打不开存在浏览器里的数据', 'The data kept in this browser could not be opened', 'No se pudieron abrir los datos guardados en este navegador', 'Impossible d’ouvrir les données conservées dans ce navigateur', 'このブラウザに保存されたデータを開けませんでした', 'Die in diesem Browser gespeicherten Daten konnten nicht geöffnet werden', '이 브라우저에 저장된 데이터를 열 수 없어요', 'Impossibile aprire i dati conservati in questo browser', 'Não foi possível abrir os dados guardados neste navegador', 'इस ब्राउज़र में रखा डेटा खुल नहीं सका'),
  failedBody: row(
    '可以再试一次。还是不行的话，把下面这行发给开发者。',
    'Try again. If it still fails, send the line below to the developer.',
    'Vuelve a intentarlo. Si sigue fallando, envía la línea de abajo al desarrollador.',
    'Réessayez. Si cela échoue encore, envoyez la ligne ci-dessous au développeur.',
    'もう一度お試しください。それでも開けない場合は、下の行を開発者に送ってください。',
    'Versuche es erneut. Wenn es weiterhin scheitert, schicke die Zeile unten an den Entwickler.',
    '다시 시도해 주세요. 그래도 안 되면 아래 줄을 개발자에게 보내 주세요.',
    'Riprova. Se non funziona ancora, invia la riga qui sotto allo sviluppatore.',
    'Tente de novo. Se ainda falhar, envie a linha abaixo ao desenvolvedor.',
    'दोबारा कोशिश करें। फिर भी न खुले तो नीचे की पंक्ति डेवलपर को भेजें।',
  ),
  putBackTitle: row('这个版本打不开你的数据', 'This version could not open your data', 'Esta versión no pudo abrir tus datos', 'Cette version n’a pas pu ouvrir vos données', 'このバージョンではデータを開けませんでした', 'Diese Version konnte deine Daten nicht öffnen', '이 버전에서 데이터를 열 수 없어요', 'Questa versione non è riuscita ad aprire i tuoi dati', 'Esta versão não conseguiu abrir seus dados', 'यह संस्करण आपका डेटा नहीं खोल सका'),
  putBackBody: row(
    '数据已经放回升级前的样子，没有丢。先下载一份备份，过些时候再打开；还是不行的话，把下面这行发给开发者。',
    'Your data has been put back as it was before the update, and none is lost. Download a backup now and come back later. If it still fails, send the line below to the developer.',
    'Tus datos se han dejado como estaban antes de la actualización y no se ha perdido nada. Descarga una copia de seguridad y vuelve más tarde. Si sigue fallando, envía la línea de abajo al desarrollador.',
    'Vos données ont été remises comme avant la mise à jour, et rien n’est perdu. Téléchargez une sauvegarde et revenez plus tard. Si cela échoue encore, envoyez la ligne ci-dessous au développeur.',
    'データは更新前の状態に戻してあり、失われたものはありません。バックアップをダウンロードして、しばらくしてからもう一度開いてください。それでも開けない場合は、下の行を開発者に送ってください。',
    'Deine Daten wurden so zurückgestellt, wie sie vor dem Update waren; nichts ist verloren. Lade jetzt eine Sicherung herunter und komm später wieder. Wenn es weiterhin scheitert, schicke die Zeile unten an den Entwickler.',
    '데이터는 업데이트 전 상태로 되돌려 놓았고, 잃은 것은 없어요. 지금 백업을 내려받고 나중에 다시 열어 주세요. 그래도 안 되면 아래 줄을 개발자에게 보내 주세요.',
    'I tuoi dati sono stati rimessi com’erano prima dell’aggiornamento e nulla è andato perso. Scarica ora un backup e torna più tardi. Se non funziona ancora, invia la riga qui sotto allo sviluppatore.',
    'Seus dados foram deixados como estavam antes da atualização, e nada se perdeu. Baixe um backup agora e volte mais tarde. Se ainda falhar, envie a linha abaixo ao desenvolvedor.',
    'आपका डेटा अपडेट से पहले जैसा कर दिया गया है और कुछ भी नहीं खोया। अभी बैकअप डाउनलोड करें और बाद में दोबारा खोलें। फिर भी न खुले तो नीचे की पंक्ति डेवलपर को भेजें।',
  ),
  again: row('再试一次', 'Try again', 'Reintentar', 'Réessayer', 'もう一度試す', 'Erneut versuchen', '다시 시도', 'Riprova', 'Tentar de novo', 'दोबारा कोशिश करें'),
}

export function startupWords(locale: UiLocale) {
  const at = UI_LOCALES.indexOf(locale)
  return Object.fromEntries(Object.entries(startup).map(([key, values]) => [key, values[at]])) as Record<keyof typeof startup, string>
}
