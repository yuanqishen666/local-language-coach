/** What the web version says that the app does not, or says differently. One wording for each language the app speaks, in the order of UI_LOCALES. */
import { UI_LOCALES, type UiLocale } from '../shared/locales'

type Row = readonly [string, string, string, string, string, string, string, string, string, string]
const row = (...values: Row) => values

/** The backup page. */
const words = {
  nav: row('备份', 'Backup', 'Copia', 'Sauvegarde', 'バックアップ', 'Sicherung', '백업', 'Backup', 'Backup', 'बैकअप'),
  navNever: row('还没备份', 'No backup yet', 'Sin copia aún', 'Pas de sauvegarde', '未バックアップ', 'Keine Sicherung', '백업 없음', 'Nessun backup', 'Sem backup', 'बैकअप नहीं'),
  body: row(
    '你的数据只存在这个浏览器里。换浏览器、换设备，或者清除网站数据，它就没有了。下载一份备份，可以在任何浏览器里恢复。',
    'Your data is kept only in this browser. Switching browsers or devices, or clearing site data, leaves it behind. Download a backup and you can restore it in any browser.',
    'Tus datos se guardan solo en este navegador. Si cambias de navegador o de dispositivo, o borras los datos del sitio, se pierden. Descarga una copia y podrás restaurarla en cualquier navegador.',
    'Vos données ne sont conservées que dans ce navigateur. Si vous changez de navigateur ou d’appareil, ou si vous effacez les données du site, elles sont perdues. Téléchargez une sauvegarde pour pouvoir la restaurer dans n’importe quel navigateur.',
    'データはこのブラウザの中だけに保存されています。ブラウザや端末を変えたり、サイトのデータを消去したりすると失われます。バックアップをダウンロードしておけば、どのブラウザでも復元できます。',
    'Deine Daten liegen nur in diesem Browser. Wechselst du Browser oder Gerät oder löschst du die Websitedaten, sind sie weg. Lade eine Sicherung herunter, dann kannst du sie in jedem Browser wiederherstellen.',
    '데이터는 이 브라우저에만 저장돼요. 브라우저나 기기를 바꾸거나 사이트 데이터를 지우면 사라져요. 백업을 내려받아 두면 어느 브라우저에서든 복원할 수 있어요.',
    'I tuoi dati sono conservati solo in questo browser. Se cambi browser o dispositivo, o cancelli i dati del sito, vanno persi. Scarica un backup e potrai ripristinarlo in qualsiasi browser.',
    'Seus dados ficam só neste navegador. Se você trocar de navegador ou de aparelho, ou limpar os dados do site, eles se perdem. Baixe um backup para restaurá-lo em qualquer navegador.',
    'आपका डेटा केवल इसी ब्राउज़र में रहता है। ब्राउज़र या डिवाइस बदलने पर, या साइट का डेटा मिटाने पर, यह चला जाता है। बैकअप डाउनलोड कर लें, फिर इसे किसी भी ब्राउज़र में वापस ला सकते हैं।',
  ),
  last: row('上次备份：{when}', 'Last backup: {when}', 'Última copia: {when}', 'Dernière sauvegarde : {when}', '前回のバックアップ：{when}', 'Letzte Sicherung: {when}', '마지막 백업: {when}', 'Ultimo backup: {when}', 'Último backup: {when}', 'पिछला बैकअप: {when}'),
  never: row('还没有备份过', 'No backup has been made yet', 'Aún no se ha hecho ninguna copia', 'Aucune sauvegarde pour l’instant', 'まだバックアップしていません', 'Es gibt noch keine Sicherung', '아직 백업한 적이 없어요', 'Nessun backup finora', 'Nenhum backup feito ainda', 'अभी तक कोई बैकअप नहीं लिया गया'),
  kept: row(
    '浏览器已答应不会自动清理这些数据。',
    'The browser has agreed not to clear this data on its own.',
    'El navegador aceptó no borrar estos datos por su cuenta.',
    'Le navigateur a accepté de ne pas effacer ces données de lui-même.',
    'ブラウザは、このデータを自動では消去しないと約束しています。',
    'Der Browser hat zugesagt, diese Daten nicht von sich aus zu löschen.',
    '브라우저가 이 데이터를 자동으로 지우지 않기로 했어요.',
    'Il browser ha accettato di non cancellare questi dati da solo.',
    'O navegador concordou em não apagar esses dados por conta própria.',
    'ब्राउज़र ने मान लिया है कि वह यह डेटा अपने आप नहीं मिटाएगा।',
  ),
  notKept: row(
    '设备空间不足时，浏览器可能自动清理这些数据。',
    'When the device runs short of space, the browser may clear this data on its own.',
    'Si al dispositivo le falta espacio, el navegador puede borrar estos datos por su cuenta.',
    'Si l’appareil manque d’espace, le navigateur peut effacer ces données de lui-même.',
    '端末の空き容量が足りなくなると、ブラウザがこのデータを自動で消去することがあります。',
    'Wird der Speicher des Geräts knapp, kann der Browser diese Daten von sich aus löschen.',
    '기기 저장 공간이 부족하면 브라우저가 이 데이터를 자동으로 지울 수 있어요.',
    'Se il dispositivo ha poco spazio, il browser può cancellare questi dati da solo.',
    'Se o aparelho ficar com pouco espaço, o navegador pode apagar esses dados por conta própria.',
    'डिवाइस में जगह कम पड़ने पर ब्राउज़र यह डेटा अपने आप मिटा सकता है।',
  ),
  safari: row(
    'Safari 会清掉 7 天没有用过的网站的数据。把这个网站添加到主屏幕或程序坞，就不受这条限制。',
    'Safari clears the data of a site that has not been used for 7 days. Adding this site to the Home Screen or the Dock lifts that limit.',
    'Safari borra los datos de un sitio que no se ha usado en 7 días. Si añades este sitio a la pantalla de inicio o al Dock, ese límite no se aplica.',
    'Safari efface les données d’un site resté 7 jours sans être utilisé. Ajouter ce site à l’écran d’accueil ou au Dock lève cette limite.',
    'Safariは、7日間使われなかったサイトのデータを消去します。このサイトをホーム画面やDockに追加すると、この制限はなくなります。',
    'Safari löscht die Daten einer Website, die 7 Tage lang nicht benutzt wurde. Fügst du diese Website zum Home-Bildschirm oder zum Dock hinzu, gilt diese Grenze nicht.',
    'Safari는 7일 동안 쓰지 않은 사이트의 데이터를 지워요. 이 사이트를 홈 화면이나 Dock에 추가하면 이 제한을 받지 않아요.',
    'Safari cancella i dati di un sito che non viene usato per 7 giorni. Aggiungendo questo sito alla schermata Home o al Dock il limite non vale più.',
    'O Safari apaga os dados de um site que fica 7 dias sem uso. Adicionar este site à Tela de Início ou ao Dock remove esse limite.',
    'Safari उस साइट का डेटा मिटा देता है जो 7 दिन तक इस्तेमाल न हुई हो। इस साइट को होम स्क्रीन या Dock में जोड़ने पर यह सीमा नहीं रहती।',
  ),
  download: row('下载备份', 'Download backup', 'Descargar copia', 'Télécharger la sauvegarde', 'バックアップをダウンロード', 'Sicherung herunterladen', '백업 내려받기', 'Scarica backup', 'Baixar backup', 'बैकअप डाउनलोड करें'),
  downloadNote: row(
    '备份文件里有你的模型密钥，不要发给别人。',
    'The backup file contains your model keys. Do not send it to anyone.',
    'La copia contiene tus claves de modelo. No la envíes a nadie.',
    'La sauvegarde contient vos clés de modèle. Ne l’envoyez à personne.',
    'バックアップにはモデルのキーが含まれます。他の人に送らないでください。',
    'Die Sicherung enthält deine Modellschlüssel. Schick sie niemandem.',
    '백업 파일에는 모델 키가 들어 있어요. 다른 사람에게 보내지 마세요.',
    'Il backup contiene le tue chiavi dei modelli. Non inviarlo a nessuno.',
    'O backup contém suas chaves de modelo. Não o envie a ninguém.',
    'बैकअप फ़ाइल में आपकी मॉडल कुंजियाँ हैं। इसे किसी को न भेजें।',
  ),
  restoreTitle: row('从备份恢复', 'Restore from a backup', 'Restaurar desde una copia', 'Restaurer depuis une sauvegarde', 'バックアップから復元', 'Aus einer Sicherung wiederherstellen', '백업에서 복원', 'Ripristina da un backup', 'Restaurar de um backup', 'बैकअप से वापस लाएँ'),
  restoreBody: row(
    '恢复会替换这个浏览器里现有的全部数据。在电脑上运行的版本，把它的 data 文件夹压缩成 zip，也可以在这里恢复。',
    'Restoring replaces everything now kept in this browser. A zipped data folder from the version that runs on a computer can be restored here too.',
    'Restaurar reemplaza todo lo que hay ahora en este navegador. También puedes restaurar aquí la carpeta data, comprimida en zip, de la versión que se ejecuta en un ordenador.',
    'La restauration remplace tout ce que ce navigateur contient actuellement. Le dossier data de la version installée sur un ordinateur, compressé en zip, peut aussi être restauré ici.',
    '復元すると、このブラウザに今あるデータはすべて置き換えられます。パソコンで動かす版の data フォルダを zip にしたものも、ここで復元できます。',
    'Beim Wiederherstellen wird alles ersetzt, was jetzt in diesem Browser liegt. Auch der als zip gepackte Ordner data der Version, die auf einem Computer läuft, lässt sich hier wiederherstellen.',
    '복원하면 지금 이 브라우저에 있는 데이터가 모두 바뀌어요. 컴퓨터에서 실행하는 버전의 data 폴더를 zip으로 묶은 파일도 여기서 복원할 수 있어요.',
    'Il ripristino sostituisce tutto ciò che ora si trova in questo browser. Qui si può ripristinare anche la cartella data, compressa in zip, della versione che gira su un computer.',
    'Restaurar substitui tudo o que está agora neste navegador. A pasta data da versão que roda em um computador, compactada em zip, também pode ser restaurada aqui.',
    'वापस लाने पर इस ब्राउज़र में अभी मौजूद सारा डेटा बदल जाता है। कंप्यूटर पर चलने वाले संस्करण का data फ़ोल्डर zip बनाकर यहाँ भी वापस लाया जा सकता है।',
  ),
  choose: row('选择备份文件', 'Choose a backup file', 'Elegir una copia', 'Choisir une sauvegarde', 'バックアップファイルを選ぶ', 'Sicherungsdatei wählen', '백업 파일 선택', 'Scegli un backup', 'Escolher um backup', 'बैकअप फ़ाइल चुनें'),
  confirmTitle: row('替换现有的全部数据？', 'Replace everything kept here?', '¿Reemplazar todo lo guardado aquí?', 'Remplacer tout ce qui est conservé ici ?', '今あるデータをすべて置き換えますか？', 'Alles ersetzen, was hier liegt?', '지금 있는 데이터를 모두 바꿀까요?', 'Sostituire tutto ciò che è conservato qui?', 'Substituir tudo o que está guardado aqui?', 'यहाँ रखा सब कुछ बदल दें?'),
  confirmBody: row(
    '「{name}」里的数据会替换这个浏览器里现有的对话、生词、记忆、设置和密钥。这一步不能撤销。',
    'What is in {name} replaces the conversations, words, memories, settings and keys now in this browser. This cannot be undone.',
    'El contenido de {name} reemplaza las conversaciones, palabras, recuerdos, ajustes y claves que hay ahora en este navegador. No se puede deshacer.',
    'Le contenu de {name} remplace les conversations, les mots, les souvenirs, les réglages et les clés présents dans ce navigateur. Cette action est irréversible.',
    '{name} の内容が、このブラウザに今ある会話、単語、記憶、設定、キーを置き換えます。元に戻すことはできません。',
    'Der Inhalt von {name} ersetzt die Gespräche, Wörter, Erinnerungen, Einstellungen und Schlüssel, die jetzt in diesem Browser liegen. Das lässt sich nicht rückgängig machen.',
    '{name}의 내용이 지금 이 브라우저에 있는 대화, 단어, 기억, 설정, 키를 대신해요. 되돌릴 수 없어요.',
    'Il contenuto di {name} sostituisce le conversazioni, le parole, i ricordi, le impostazioni e le chiavi ora presenti in questo browser. Non si può annullare.',
    'O conteúdo de {name} substitui as conversas, palavras, memórias, configurações e chaves que estão agora neste navegador. Não é possível desfazer.',
    '{name} की सामग्री इस ब्राउज़र में अभी मौजूद बातचीत, शब्द, यादें, सेटिंग और कुंजियों की जगह ले लेगी। इसे पलटा नहीं जा सकता।',
  ),
  confirm: row('替换', 'Replace', 'Reemplazar', 'Remplacer', '置き換える', 'Ersetzen', '바꾸기', 'Sostituisci', 'Substituir', 'बदलें'),
  restoring: row('正在恢复…', 'Restoring…', 'Restaurando…', 'Restauration…', '復元中…', 'Wird wiederhergestellt…', '복원 중…', 'Ripristino…', 'Restaurando…', 'वापस लाया जा रहा है…'),
  unreadable: row(
    '这个文件打不开：它不是 zip 文件，或者已经损坏。',
    'This file cannot be read: it is not a zip file, or it is damaged.',
    'No se puede leer este archivo: no es un zip o está dañado.',
    'Ce fichier est illisible : ce n’est pas un zip, ou il est endommagé.',
    'このファイルは読み込めません。zip ファイルではないか、壊れています。',
    'Diese Datei lässt sich nicht lesen: Sie ist keine zip-Datei oder beschädigt.',
    '이 파일을 읽을 수 없어요. zip 파일이 아니거나 손상됐어요.',
    'Impossibile leggere questo file: non è uno zip oppure è danneggiato.',
    'Não foi possível ler este arquivo: não é um zip ou está danificado.',
    'यह फ़ाइल पढ़ी नहीं जा सकी: यह zip फ़ाइल नहीं है, या ख़राब हो गई है।',
  ),
  notBackup: row(
    '这个文件不是这个应用的备份。',
    'This file is not a backup of this app.',
    'Este archivo no es una copia de esta aplicación.',
    'Ce fichier n’est pas une sauvegarde de cette application.',
    'このファイルは、このアプリのバックアップではありません。',
    'Diese Datei ist keine Sicherung dieser App.',
    '이 파일은 이 앱의 백업이 아니에요.',
    'Questo file non è un backup di questa app.',
    'Este arquivo não é um backup deste aplicativo.',
    'यह फ़ाइल इस ऐप का बैकअप नहीं है।',
  ),
  inUse: row(
    '这份文件是在应用还开着的时候打包的，最近的改动不在里面。先停掉电脑上的应用，再重新打包。',
    'This file was zipped while the app was still running, so the latest changes are not in it. Stop the app on the computer, then zip the folder again.',
    'Este archivo se comprimió con la aplicación aún en marcha, así que faltan los últimos cambios. Detén la aplicación en el ordenador y vuelve a comprimir la carpeta.',
    'Ce fichier a été compressé alors que l’application tournait encore : les derniers changements n’y figurent pas. Arrêtez l’application sur l’ordinateur, puis compressez de nouveau le dossier.',
    'このファイルはアプリの実行中に圧縮されたため、最近の変更が入っていません。パソコンのアプリを止めてから、フォルダを圧縮し直してください。',
    'Diese Datei wurde gepackt, während die App noch lief; die letzten Änderungen fehlen darin. Beende die App auf dem Computer und packe den Ordner erneut.',
    '이 파일은 앱이 실행 중일 때 묶여서 최근 변경 내용이 빠져 있어요. 컴퓨터의 앱을 멈춘 뒤 폴더를 다시 묶어 주세요.',
    'Questo file è stato compresso mentre l’app era ancora in esecuzione, quindi mancano le ultime modifiche. Ferma l’app sul computer e comprimi di nuovo la cartella.',
    'Este arquivo foi compactado com o aplicativo ainda em execução, então faltam as últimas alterações. Pare o aplicativo no computador e compacte a pasta de novo.',
    'यह फ़ाइल ऐप के चलते समय zip की गई थी, इसलिए हाल के बदलाव इसमें नहीं हैं। कंप्यूटर पर ऐप बंद करें, फिर फ़ोल्डर को दोबारा zip करें।',
  ),
  failed: row(
    '恢复没有完成，原来的数据还在。刷新页面后可以继续使用。',
    'The restore did not finish, and what was here before is still here. Reload the page to go on.',
    'La restauración no terminó y lo que había antes sigue aquí. Recarga la página para continuar.',
    'La restauration n’a pas abouti ; ce qui était là auparavant s’y trouve toujours. Rechargez la page pour continuer.',
    '復元は完了しませんでした。元のデータは残っています。ページを再読み込みすると続けられます。',
    'Die Wiederherstellung wurde nicht abgeschlossen; was vorher hier lag, ist noch da. Lade die Seite neu, um weiterzumachen.',
    '복원이 끝나지 않았어요. 이전 데이터는 그대로 있어요. 페이지를 새로 고치면 계속 쓸 수 있어요.',
    'Il ripristino non è stato completato e ciò che c’era prima è ancora qui. Ricarica la pagina per continuare.',
    'A restauração não foi concluída, e o que estava aqui antes continua aqui. Recarregue a página para continuar.',
    'वापस लाना पूरा नहीं हुआ, और जो पहले यहाँ था वह अब भी यहाँ है। आगे बढ़ने के लिए पेज दोबारा लोड करें।',
  ),
}

/** A page in a browser may not read other sites, so here the app does not ask for a web address, and says why one could not be read. */
const instead = {
  entryTip: row(
    '粘贴文章、字幕或歌词，改写成你的难度后开聊',
    'Paste an article, subtitles or lyrics. It is rewritten at your level, then you talk about it',
    'Pega un artículo, subtítulos o una letra. Se reescribe a tu nivel y luego conversas',
    'Collez un article, des sous-titres ou des paroles. Le texte est réécrit à votre niveau, puis vous en parlez',
    '記事・字幕・歌詞を貼ると、あなたのレベルに書き直してから話せます',
    'Füge einen Artikel, Untertitel oder einen Liedtext ein. Der Text wird auf deinem Niveau neu geschrieben, dann sprichst du darüber',
    '글, 자막, 가사를 붙여 넣으면 내 수준에 맞게 다시 쓴 뒤 대화해요',
    'Incolla un articolo, dei sottotitoli o un testo di canzone. Viene riscritto al tuo livello, poi ne parli',
    'Cole um artigo, legendas ou uma letra. O texto é reescrito no seu nível e depois você conversa',
    'लेख, सबटाइटल या गीत के बोल चिपकाएँ। उसे आपके स्तर पर दोबारा लिखा जाता है, फिर आप उस पर बात करते हैं',
  ),
  placeholder: row(
    '粘贴文章、字幕或歌词',
    'Paste an article, subtitles or lyrics',
    'Pega un artículo, subtítulos o una letra',
    'Collez un article, des sous-titres ou des paroles',
    '記事、字幕、歌詞を貼り付け',
    'Artikel, Untertitel oder Liedtext einfügen',
    '글, 자막 또는 가사 붙여넣기',
    'Incolla un articolo, sottotitoli o un testo di canzone',
    'Cole um artigo, legendas ou uma letra',
    'लेख, सबटाइटल या गीत के बोल चिपकाएँ',
  ),
  readFailed: row(
    '在浏览器里运行的版本读不了别的网站，请把正文粘贴进来。',
    'The version that runs in a browser cannot read other sites. Paste the text of the page instead.',
    'La versión que se ejecuta en el navegador no puede leer otros sitios. Pega el texto de la página.',
    'La version qui fonctionne dans le navigateur ne peut pas lire d’autres sites. Collez plutôt le texte de la page.',
    'ブラウザで動く版は、ほかのサイトを読めません。ページの本文を貼り付けてください。',
    'Die Version, die im Browser läuft, kann keine anderen Websites lesen. Füge stattdessen den Text der Seite ein.',
    '브라우저에서 실행되는 버전은 다른 사이트를 읽을 수 없어요. 페이지 본문을 붙여 넣어 주세요.',
    'La versione che gira nel browser non può leggere altri siti. Incolla invece il testo della pagina.',
    'A versão que roda no navegador não consegue ler outros sites. Cole o texto da página.',
    'ब्राउज़र में चलने वाला संस्करण दूसरी साइटें नहीं पढ़ सकता। पेज का पाठ चिपकाएँ।',
  ),
}

/** Where the app says its data stays on the device: here that is one browser on it, and the site is someone else's computer. */
const privacy = row(
  '练习记录和密钥只保存在这个浏览器里；对话内容只发给你自己选的模型服务，本站服务器不接收',
  'Practice data and keys stay in this browser. What you say goes only to the model provider you choose; this site’s server receives none of it',
  'Tus prácticas y claves se guardan solo en este navegador. Lo que dices va solo al proveedor de modelos que elijas; el servidor de este sitio no recibe nada',
  'Vos données d’entraînement et vos clés restent dans ce navigateur. Ce que vous dites n’est envoyé qu’au fournisseur de modèle que vous choisissez ; le serveur de ce site n’en reçoit rien',
  '練習データとキーはこのブラウザだけに保存されます。会話の内容はあなたが選んだモデル提供元にだけ送られ、このサイトのサーバーには届きません',
  'Übungsdaten und Schlüssel bleiben in diesem Browser. Was du sagst, geht nur an den Modellanbieter, den du wählst; der Server dieser Website erhält nichts davon',
  '연습 기록과 키는 이 브라우저에만 저장돼요. 대화 내용은 직접 고른 모델 제공업체에만 전송되고, 이 사이트 서버는 받지 않아요',
  'Dati di pratica e chiavi restano in questo browser. Ciò che dici va solo al fornitore di modelli che scegli; il server di questo sito non riceve nulla',
  'Seus dados de prática e chaves ficam neste navegador. O que você diz vai apenas para o provedor de modelos que você escolher; o servidor deste site não recebe nada',
  'अभ्यास का डेटा और कुंजियाँ इसी ब्राउज़र में रहती हैं। आप जो कहते हैं वह केवल आपके चुने हुए मॉडल प्रदाता को जाता है; इस साइट के सर्वर को कुछ नहीं मिलता',
)

/** Said to someone whose page stayed open while a newer version was put on the site. */
const update = {
  found: row(
    '有新版本，刷新后生效。',
    'A newer version is ready. Reload to use it.',
    'Hay una versión más reciente. Recarga para usarla.',
    'Une version plus récente est disponible. Rechargez pour l’utiliser.',
    '新しいバージョンがあります。再読み込みすると使えます。',
    'Eine neuere Version ist da. Lade die Seite neu, um sie zu nutzen.',
    '새 버전이 있어요. 새로 고치면 적용돼요.',
    'È disponibile una versione più recente. Ricarica per usarla.',
    'Há uma versão mais recente. Recarregue para usar.',
    'नया संस्करण उपलब्ध है। इस्तेमाल करने के लिए पेज दोबारा लोड करें।',
  ),
  reload: row('刷新', 'Reload', 'Recargar', 'Recharger', '再読み込み', 'Neu laden', '새로 고침', 'Ricarica', 'Recarregar', 'दोबारा लोड करें'),
}

export type WebWord = keyof typeof words

export function webWord(key: WebWord, locale: string) {
  return words[key][Math.max(0, UI_LOCALES.indexOf(locale as UiLocale))]
}

/** The wording above as messages to lay over the app's own: what is new under web, the rest in place of what the app says. */
export function webMessages() {
  const said = (table: Record<string, Row>, at: number) => Object.fromEntries(Object.entries(table).map(([key, values]) => [key, values[at]]))
  return UI_LOCALES.map((locale, at) => ({
    locale,
    messages: {
      web: {
        backup: { ...said(words, at), navNow: words.navNever[at] },
        update: said(update, at),
      },
      import: said(instead, at),
      onboarding: { privacy: privacy[at] },
    },
  }))
}
