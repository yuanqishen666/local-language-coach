import type { UiLocale } from '../../shared/locales'

interface PrivacyCopy {
  openTitle: string
  open: readonly [string, string, string, string]
  beta: readonly [string, string, string]
  model: string
}

export const privacyCopy = {
  'zh-CN': {
    openTitle: '开源网页版',
    open: [
      '对话、词本、复习记录、记忆、学习进度、偏好和模型密钥都保存在当前浏览器里。开源网页版无需注册，语见的服务器不会收到这些记录。换设备或浏览器时，记录不会自动跟过去。',
      '你选择的模型服务会收到完成当前请求所需的内容，例如你发的消息、相关对话或记忆。使用语音输入时，音频可能由浏览器的语音服务或所选模型服务处理。内容如何留存由相应服务的隐私政策决定。',
      '你可以在「对话记录」「词本」和「我的记忆」里查看并删除相应内容，在「进步」里查看学习记录。要删除这个浏览器里的全部语见数据（包括设置和模型密钥），可以在浏览器设置里清除本站的网站数据。删除前可先下载备份。',
      '侧栏的「备份」可以下载或恢复完整备份。恢复备份会替换当前浏览器里的数据。备份里也有模型密钥，请妥善保管。只想带走一部分内容，可以在对话里导出文本，在「我的记忆」里导出记忆，或从「词本」导出到 Anki。',
    ],
    beta: [
      '内测版把用户名、偏好、对话、词本、记忆和学习进度保存在语见的服务器上。其他学习者看不到这些记录，你可以在另一台设备登录同一账号继续学习。登录状态保存在当前浏览器里，站点会记录模型用量来计算每日额度。开源网页版里的记录不会自动转入内测版。',
      '模型服务会收到完成当前请求所需的消息和相关内容。使用语音输入时，音频可能由浏览器或模型的语音服务处理。内容如何留存由相应服务的隐私政策决定。',
      '你可以在应用里查看和删除对话、词条和记忆，也可以在「账号」页导出学习数据。注销账号需要确认密码，会删除账号和站内学习记录，无法恢复。',
    ],
    model: '内测版当前使用的模型是 {model}。',
  },
  'en-US': {
    openTitle: 'Open-source web app',
    open: [
      'Chats, saved words, review history, memories, progress, preferences, and model keys stay in this browser. The web app works without an account. Yujian’s server doesn’t receive those records, and they won’t follow you automatically to another browser or device.',
      'The model service you choose receives what it needs for the current request, such as your message, relevant chat history, or memories. With voice input, your browser’s speech service or your model provider may process the audio. Each service’s privacy policy explains what it keeps.',
      'You can view and delete entries in Conversations, Wordbook, and Memories, and see your learning activity in Progress. To remove all Yujian data from this browser, including settings and model keys, clear this site’s data in your browser settings. You can save a backup first.',
      'Use Backup in the sidebar to download or restore a full copy. Restoring a backup replaces the data in this browser. The backup also holds your model keys, so keep it somewhere private. To take just part of your data, export a chat as text, download your memories, or export saved words to Anki.',
    ],
    beta: [
      'The closed beta stores your username, preferences, chats, saved words, memories, and progress on Yujian’s server. Other learners can’t see those records. Sign in to the same account on another device to pick up where you left off. Your browser keeps you signed in, and the site tracks model usage to work out your daily allowance. Records from the open-source web app aren’t transferred automatically.',
      'The model provider receives the messages and context needed to answer the current request. With voice input, the browser’s or model provider’s speech service may process the audio. Each service’s privacy policy explains what it keeps.',
      'You can view or delete chats, saved words, and memories in the app, or export your learning data from Account. Deleting your account requires your password and permanently removes your account and learning records from Yujian.',
    ],
    model: 'The closed beta currently uses {model}.',
  },
  'es-419': {
    openTitle: 'Versión web de código abierto',
    open: [
      'Tus conversaciones, palabras guardadas, repasos, recuerdos, avances, preferencias y claves de los modelos se quedan en este navegador. La versión web funciona sin cuenta y el servidor de Yujian no recibe esos datos. Si cambias de navegador o de dispositivo, tus registros no se trasladan solos.',
      'El servicio de modelos que elijas recibe lo necesario para atender tu solicitud, como tu mensaje, conversaciones anteriores o recuerdos relacionados. Si usas la entrada de voz, el servicio de reconocimiento del navegador o el del modelo puede procesar el audio. Cada servicio explica en su política de privacidad qué conserva.',
      'En el historial de conversaciones, el vocabulario y tus recuerdos puedes consultar y borrar elementos. En Progreso puedes ver tu actividad. Si quieres borrar también las preferencias y las claves, elimina los datos de este sitio en la configuración del navegador. Puedes guardar una copia antes.',
      'Desde Copia, en la barra lateral, puedes descargar o restaurar una copia completa. Al restaurarla, se reemplazan los datos de este navegador. Guárdala en un lugar privado porque incluye tus claves. También puedes exportar una conversación como texto, descargar tus recuerdos o llevar el vocabulario a Anki.',
    ],
    beta: [
      'La beta guarda tu nombre de usuario, preferencias, conversaciones, vocabulario, recuerdos y avances en el servidor de Yujian. Los demás estudiantes no pueden ver esos datos. Puedes seguir aprendiendo desde otro dispositivo con la misma cuenta. El navegador mantiene la sesión abierta y el sitio registra el uso del modelo para calcular tu cupo diario. Tus datos de la versión web de código abierto no se pasan automáticamente a la beta.',
      'El proveedor del modelo recibe los mensajes y el contexto que necesita para responder. Si usas la entrada de voz, el servicio de reconocimiento del navegador o el del modelo puede procesar el audio. La política de privacidad de cada servicio explica qué conserva.',
      'En la aplicación puedes consultar y borrar conversaciones, palabras y recuerdos. En Cuenta puedes exportar tus datos de aprendizaje. Para eliminar la cuenta tienes que confirmar tu contraseña. Se borran la cuenta y sus registros de aprendizaje de forma definitiva.',
    ],
    model: 'La beta usa actualmente {model}.',
  },
  'fr-FR': {
    openTitle: 'Version web open source',
    open: [
      'Vos conversations, mots enregistrés, révisions, souvenirs, progrès, préférences et clés de modèle restent dans ce navigateur. La version web fonctionne sans compte et le serveur de Yujian ne reçoit pas ces données. Elles ne vous suivent pas automatiquement si vous changez de navigateur ou d’appareil.',
      'Le service de modèle que vous choisissez reçoit ce dont il a besoin pour traiter votre demande, par exemple votre message, les échanges précédents ou des souvenirs utiles. Si vous dictez un message, le service de reconnaissance vocale de votre navigateur ou du modèle peut traiter l’audio. La politique de confidentialité de chaque service précise ce qu’il conserve.',
      'Vous pouvez consulter et effacer des éléments dans l’historique des conversations, le carnet de mots et vos souvenirs. La page Progression présente votre activité. Pour tout effacer de ce navigateur, y compris vos réglages et vos clés, supprimez les données du site dans les paramètres du navigateur. Vous pouvez d’abord enregistrer une sauvegarde.',
      'La rubrique Sauvegarde, dans la barre latérale, permet de télécharger ou de restaurer une copie complète. La restauration remplace les données de ce navigateur. Gardez la copie dans un endroit sûr, car elle contient vos clés de modèle. Vous pouvez aussi exporter une conversation en texte, télécharger vos souvenirs ou envoyer vos mots dans Anki.',
    ],
    beta: [
      'La bêta conserve votre nom d’utilisateur, vos préférences, vos conversations, vos mots, vos souvenirs et vos progrès sur le serveur de Yujian. Les autres personnes qui utilisent l’application n’ont pas accès à ces données. Connectez-vous avec le même compte sur un autre appareil pour reprendre votre apprentissage. Votre navigateur garde la session ouverte et le site suit votre utilisation du modèle pour calculer votre quota du jour. Les données de la version web open source ne sont pas transférées automatiquement.',
      'Le fournisseur du modèle reçoit les messages et le contexte dont il a besoin pour répondre. En cas de dictée, le service de reconnaissance vocale du navigateur ou du modèle peut traiter l’audio. La politique de confidentialité de chaque service précise ce qu’il conserve.',
      'Vous pouvez consulter et supprimer des conversations, des mots et des souvenirs dans l’application, et exporter vos données d’apprentissage dans la rubrique Compte. La suppression du compte demande votre mot de passe et efface définitivement le compte et ses données d’apprentissage.',
    ],
    model: 'La bêta utilise actuellement {model}.',
  },
  'ja-JP': {
    openTitle: 'オープンソースのウェブ版',
    open: [
      '会話、単語帳、復習履歴、記憶、学習の進み具合、設定、モデルのキーは、このブラウザに保存されます。アカウント登録は不要で、これらの記録は語見のサーバーには送られません。別のブラウザや端末には自動で引き継がれません。',
      '選んだモデルのサービスには、返答に必要なメッセージや関連する会話・記憶が送られます。音声入力を使うと、ブラウザやモデルの音声認識サービスが音声を処理することがあります。何が保存されるかは、各サービスのプライバシーポリシーで確認できます。',
      '会話履歴、単語帳、記憶のページで、保存した項目を確認・削除できます。学習の記録は進捗ページで確認できます。設定やモデルのキーも含めてすべて削除するには、ブラウザの設定でこのサイトのデータを消去します。必要な記録は先にバックアップできます。',
      'サイドバーの「バックアップ」では、データをまとめてダウンロードしたり、以前のバックアップから復元したりできます。復元すると、このブラウザのデータがバックアップの内容に置き換わります。モデルのキーも含まれるので、共有せずに保管してください。会話をテキストで書き出したり、記憶を個別に保存したり、単語帳を Anki に移したりすることもできます。',
    ],
    beta: [
      'ベータ版では、ユーザー名、設定、会話、単語帳、記憶、学習の進み具合を語見のサーバーに保存します。他の学習者には公開されません。同じアカウントでログインすれば、別の端末でも続きから学べます。ログイン状態はブラウザに保存され、モデルの利用量は1日の利用枠の計算に使われます。オープンソースのウェブ版の記録は自動では移りません。',
      '返答に必要なメッセージや関連する内容は、モデルのサービスに送られます。音声入力では、ブラウザやモデルの音声認識サービスが音声を処理することがあります。何が保存されるかは、各サービスのプライバシーポリシーで確認できます。',
      '会話、単語、記憶はアプリ内で確認・削除できます。「アカウント」では学習データを書き出せます。アカウントを削除するにはパスワードが必要です。削除するとアカウントと学習記録は元に戻せません。',
    ],
    model: 'ベータ版では現在 {model} を使っています。',
  },
  'de-DE': {
    openTitle: 'Open-Source-Webversion',
    open: [
      'Gespräche, gespeicherte Wörter, Wiederholungen, Erinnerungen, Lernfortschritt, Einstellungen und Modellschlüssel bleiben in diesem Browser. Für die Webversion brauchst du kein Konto. Der Server von Yujian erhält diese Daten nicht. Sie ziehen auch nicht automatisch auf ein anderes Gerät oder in einen anderen Browser mit.',
      'Der Modelldienst, den du auswählst, erhält, was er für die aktuelle Anfrage braucht, etwa deine Nachricht, passende frühere Gespräche oder Erinnerungen. Bei der Spracheingabe kann der Sprachdienst deines Browsers oder des Modellanbieters die Aufnahme verarbeiten. Was der jeweilige Dienst speichert, steht in seiner Datenschutzerklärung.',
      'Im Gesprächsverlauf, in der Wortliste und bei deinen Erinnerungen kannst du einzelne Einträge ansehen und löschen. Unter Fortschritt siehst du, was du gelernt hast. Wenn du auch Einstellungen und Modellschlüssel entfernen möchtest, lösche die Daten dieser Website in deinen Browsereinstellungen. Vorher kannst du eine Sicherung herunterladen.',
      'Unter „Sicherung“ in der Seitenleiste kannst du eine vollständige Kopie herunterladen oder wiederherstellen. Beim Wiederherstellen werden die Daten in diesem Browser ersetzt. Bewahre die Sicherung geschützt auf, denn sie enthält auch deine Modellschlüssel. Du kannst Gespräche auch als Text exportieren, Erinnerungen herunterladen oder deine Wörter nach Anki mitnehmen.',
    ],
    beta: [
      'Die Beta speichert deinen Benutzernamen, deine Einstellungen, Gespräche, Wörter, Erinnerungen und deinen Lernfortschritt auf dem Server von Yujian. Andere Lernende haben darauf keinen Zugriff. Mit demselben Konto kannst du auf einem anderen Gerät weiterlernen. Dein Browser hält dich angemeldet und die Website erfasst die Modellnutzung für dein Tageskontingent. Deine Daten aus der Open-Source-Webversion werden nicht automatisch übernommen.',
      'Der Modellanbieter erhält die Nachrichten und den Zusammenhang, den er für die Antwort braucht. Bei der Spracheingabe kann der Sprachdienst deines Browsers oder des Modells die Aufnahme verarbeiten. Was der jeweilige Dienst speichert, steht in seiner Datenschutzerklärung.',
      'Gespräche, Wörter und Erinnerungen kannst du in der App ansehen oder löschen. Unter „Konto“ kannst du deine Lerndaten exportieren. Zum Löschen des Kontos brauchst du dein Passwort. Danach sind das Konto und seine Lernaufzeichnungen dauerhaft gelöscht.',
    ],
    model: 'Die Beta verwendet derzeit {model}.',
  },
  'ko-KR': {
    openTitle: '오픈소스 웹 버전',
    open: [
      '대화, 단어장, 복습 기록, 기억, 학습 진행 상황, 설정과 모델 키는 지금 쓰는 브라우저에 저장돼요. 계정을 만들 필요가 없고, 이 기록은 Yujian 서버로 전송되지 않아요. 다른 기기나 브라우저에서는 자동으로 이어지지 않아요.',
      '선택한 모델 서비스에는 답변에 필요한 메시지와 관련 대화나 기억이 전달돼요. 음성 입력을 사용하면 브라우저나 모델의 음성 인식 서비스에서 오디오를 처리할 수 있어요. 어떤 정보를 보관하는지는 각 서비스의 개인정보 처리방침에서 확인할 수 있어요.',
      '대화 기록, 단어장, 내 기억에서 항목을 확인하거나 지울 수 있고, 진행 상황에서 학습 기록을 볼 수 있어요. 설정과 모델 키까지 모두 지우려면 브라우저 설정에서 이 사이트의 데이터를 삭제하세요. 그 전에 백업을 받아 둘 수 있어요.',
      '사이드바의 ‘백업’에서 전체 데이터를 내려받거나 복원할 수 있어요. 백업을 복원하면 이 브라우저에 있던 데이터가 백업 내용으로 바뀌어요. 모델 키도 들어 있으니 안전한 곳에 보관하세요. 대화만 텍스트로 저장하거나, 기억을 내보내거나, 단어장을 Anki로 옮길 수도 있어요.',
    ],
    beta: [
      '베타에서는 사용자 이름, 설정, 대화, 단어장, 기억과 학습 기록을 Yujian 서버에 저장해요. 다른 학습자는 이 기록을 볼 수 없어요. 다른 기기에서도 같은 계정으로 로그인하면 이어서 학습할 수 있어요. 브라우저는 로그인 상태를 유지하고, 사이트는 하루 한도를 계산하기 위해 모델 사용량을 기록해요. 오픈소스 웹 버전의 기록은 자동으로 옮겨지지 않아요.',
      '답변에 필요한 메시지와 관련 내용은 모델 서비스로 전달돼요. 음성 입력을 쓰면 브라우저나 모델의 음성 인식 서비스에서 오디오를 처리할 수 있어요. 어떤 정보를 보관하는지는 각 서비스의 개인정보 처리방침에서 확인할 수 있어요.',
      '앱에서 대화, 단어, 기억을 확인하거나 지울 수 있고, ‘계정’에서 학습 데이터를 내보낼 수 있어요. 계정을 삭제하려면 비밀번호를 확인해야 해요. 삭제한 계정과 학습 기록은 복구할 수 없어요.',
    ],
    model: '베타에서는 현재 {model} 모델을 사용해요.',
  },
  'it-IT': {
    openTitle: 'Versione web open source',
    open: [
      'Conversazioni, parole salvate, ripassi, ricordi, progressi, preferenze e chiavi dei modelli restano in questo browser. La versione web funziona senza account e il server di Yujian non riceve questi dati. Quando cambi browser o dispositivo, i tuoi dati non si trasferiscono automaticamente.',
      'Il servizio di modelli che scegli riceve ciò che serve per rispondere alla richiesta, per esempio il tuo messaggio, conversazioni precedenti o ricordi pertinenti. Se usi l’input vocale, l’audio può essere elaborato dal servizio vocale del browser o del modello. L’informativa sulla privacy di ciascun servizio spiega quali dati conserva.',
      'Nella cronologia, nel vocabolario e nei tuoi ricordi puoi vedere o cancellare singoli elementi. Nella sezione Progressi trovi le tue attività di studio. Per cancellare tutto da questo browser, incluse preferenze e chiavi dei modelli, elimina i dati del sito dalle impostazioni del browser. Prima puoi scaricare un backup.',
      'Da “Backup”, nella barra laterale, puoi scaricare o ripristinare una copia completa. Il ripristino sostituisce i dati presenti in questo browser. Tieni il backup al sicuro perché contiene anche le chiavi dei modelli. Puoi anche esportare una conversazione come testo, scaricare i ricordi o trasferire le parole in Anki.',
    ],
    beta: [
      'La beta salva nome utente, preferenze, conversazioni, parole, ricordi e progressi sul server di Yujian. Gli altri studenti non possono vedere questi dati. Accedi con lo stesso account su un altro dispositivo per riprendere lo studio. Il browser mantiene l’accesso e il sito tiene conto dell’uso del modello per calcolare la quota giornaliera. I dati della versione web open source non vengono trasferiti automaticamente.',
      'Il fornitore del modello riceve i messaggi e il contesto necessari per rispondere. Se usi l’input vocale, il servizio vocale del browser o del modello può elaborare l’audio. L’informativa sulla privacy di ciascun servizio spiega quali dati conserva.',
      'Nell’app puoi vedere ed eliminare conversazioni, parole e ricordi. Da “Account” puoi esportare i tuoi dati di apprendimento. Per eliminare l’account serve la password. L’eliminazione dell’account e dei suoi dati di studio è definitiva.',
    ],
    model: 'Al momento la beta usa {model}.',
  },
  'pt-BR': {
    openTitle: 'Versão web de código aberto',
    open: [
      'Suas conversas, palavras salvas, revisões, memórias, progresso, preferências e chaves dos modelos ficam neste navegador. A versão web funciona sem conta, e o servidor do Yujian não recebe esses dados. Se você trocar de navegador ou de aparelho, os registros não vão junto automaticamente.',
      'O serviço de modelo que você escolhe recebe o que precisa para responder ao pedido, como sua mensagem, conversas anteriores ou memórias relacionadas. Quando você usa a entrada por voz, o serviço de fala do navegador ou do modelo pode processar o áudio. A política de privacidade de cada serviço explica o que ele guarda.',
      'Você pode consultar e apagar itens no histórico de conversas, no vocabulário e em suas memórias. Em Progresso, você vê seu histórico de estudos. Para apagar tudo deste navegador, incluindo as preferências e chaves dos modelos, limpe os dados do site nas configurações do navegador. Dá para baixar um backup antes.',
      'Em “Backup”, na barra lateral, você pode baixar ou restaurar uma cópia completa. A restauração substitui os dados deste navegador. Guarde a cópia em um lugar seguro, pois ela inclui as chaves dos modelos. Você também pode exportar uma conversa como texto, baixar suas memórias ou levar as palavras salvas para o Anki.',
    ],
    beta: [
      'No beta, seu nome de usuário, preferências, conversas, palavras, memórias e progresso ficam no servidor do Yujian. Outros alunos não têm acesso a esses registros. Entre com a mesma conta em outro aparelho para continuar de onde parou. O navegador mantém você conectado, e o site registra o uso do modelo para calcular a sua cota diária. Os dados da versão web de código aberto não passam automaticamente para o beta.',
      'O fornecedor do modelo recebe as mensagens e o contexto necessários para responder. Ao usar a entrada por voz, o serviço de fala do navegador ou do modelo pode processar o áudio. A política de privacidade de cada serviço explica o que ele guarda.',
      'No app, você pode consultar e apagar conversas, palavras e memórias. Em “Conta”, pode exportar seus dados de estudo. Para excluir sua conta, é preciso confirmar a senha. A exclusão da conta e de seus registros de estudo é permanente.',
    ],
    model: 'Atualmente, o beta usa {model}.',
  },
  'hi-IN': {
    openTitle: 'ओपन-सोर्स वेब संस्करण',
    open: [
      'आपकी बातचीत, सहेजे गए शब्द, दोहराई का रिकॉर्ड, यादें, सीखने की प्रगति, पसंद और मॉडल की कुंजियाँ इसी ब्राउज़र में रहती हैं। वेब संस्करण के लिए खाता बनाने की ज़रूरत नहीं है और ये रिकॉर्ड युजियान के सर्वर पर नहीं जाते। दूसरे ब्राउज़र या डिवाइस पर ये अपने-आप नहीं पहुँचते।',
      'आपके चुने हुए मॉडल की सेवा को मौजूदा अनुरोध का जवाब देने के लिए ज़रूरी जानकारी मिलती है, जैसे आपका संदेश, उससे जुड़ी पिछली बातचीत या यादें। बोलकर लिखने पर ब्राउज़र या मॉडल की आवाज़ पहचानने वाली सेवा ऑडियो इस्तेमाल कर सकती है। कौन-सी जानकारी रखी जाती है, यह हर सेवा की गोपनीयता नीति में बताया गया है।',
      'आप बातचीत के इतिहास, शब्द-संग्रह और अपनी यादों में जाकर चीज़ें देख और हटा सकते हैं। अपनी पढ़ाई का रिकॉर्ड “प्रगति” में देख सकते हैं। सेटिंग और मॉडल की कुंजियों समेत सारा डेटा हटाने के लिए ब्राउज़र की सेटिंग में इस साइट का डेटा मिटाएँ। इससे पहले आप बैकअप डाउनलोड कर सकते हैं।',
      'साइडबार में “बैकअप” से पूरी कॉपी डाउनलोड कर सकते हैं या पुरानी कॉपी से डेटा वापस ला सकते हैं। बैकअप से डेटा वापस लाने पर इस ब्राउज़र का मौजूदा डेटा बदल जाता है। बैकअप में मॉडल की कुंजियाँ भी होती हैं, इसलिए इसे सुरक्षित रखें। चाहें तो सिर्फ़ कोई बातचीत टेक्स्ट में या अपनी यादें डाउनलोड करें, या सहेजे गए शब्द Anki में ले जाएँ।',
    ],
    beta: [
      'बीटा में आपका उपयोगकर्ता नाम, पसंद, बातचीत, शब्द-संग्रह, यादें और पढ़ाई की प्रगति युजियान के सर्वर पर रहती हैं। दूसरे सीखने वाले इन्हें नहीं देख सकते। किसी दूसरे डिवाइस पर उसी खाते में साइन इन करके आप वहीं से आगे बढ़ सकते हैं। ब्राउज़र आपको साइन इन रखता है और साइट रोज़ की सीमा तय करने के लिए मॉडल के इस्तेमाल का हिसाब रखती है। ओपन-सोर्स वेब संस्करण का डेटा अपने-आप बीटा में नहीं आता।',
      'मॉडल की सेवा को जवाब देने के लिए ज़रूरी संदेश और उनसे जुड़ी जानकारी भेजी जाती है। बोलकर लिखने पर ब्राउज़र या मॉडल की आवाज़ पहचानने वाली सेवा ऑडियो इस्तेमाल कर सकती है। कौन-सी जानकारी रखी जाती है, यह हर सेवा की गोपनीयता नीति में बताया गया है।',
      'ऐप में आप बातचीत, शब्द और यादें देख या हटा सकते हैं। “खाता” पेज से पढ़ाई का डेटा डाउनलोड कर सकते हैं। खाता हटाने के लिए अपना पासवर्ड देना होता है। हटाए जाने के बाद खाता और पढ़ाई का रिकॉर्ड वापस नहीं आएँगे।',
    ],
    model: 'बीटा में फ़िलहाल {model} इस्तेमाल होता है।',
  },
} satisfies Record<UiLocale, PrivacyCopy>
