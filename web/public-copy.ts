import { UI_LOCALES, type UiLocale } from '../shared/locales'

type Row = readonly [string, string, string, string, string, string, string, string, string, string]
const row = (...texts: Row) => texts

const words = {
  brand: row('语见', 'Yujian', 'Yujian', 'Yujian', 'Yujian', 'Yujian', 'Yujian', 'Yujian', 'Yujian', 'Yujian'),
  description: row(
    '和 AI 练习真实日常对话，用自己的节奏学语言。',
    'Practice everyday conversations with AI and learn a language at your own pace.',
    'Practica conversaciones cotidianas con IA y aprende un idioma a tu ritmo.',
    'Entraînez-vous à converser au quotidien avec l’IA et apprenez une langue à votre rythme.',
    'AIと日常会話を練習し、自分のペースで言語を学びましょう。',
    'Übe Alltagsgespräche mit KI und lerne eine Sprache in deinem eigenen Tempo.',
    'AI와 일상 대화를 연습하고 나만의 속도로 언어를 배워 보세요.',
    'Esercitati nelle conversazioni di tutti i giorni con l’IA e impara una lingua al tuo ritmo.',
    'Pratique conversas do dia a dia com IA e aprenda um idioma no seu ritmo.',
    'AI के साथ रोज़मर्रा की बातचीत का अभ्यास करें और अपनी गति से भाषा सीखें।',
  ),
  language: row('界面语言', 'Interface language', 'Idioma de la interfaz', 'Langue de l’interface', '表示言語', 'Anzeigesprache', '화면 언어', 'Lingua dell’interfaccia', 'Idioma da interface', 'इंटरफ़ेस की भाषा'),
  privacy: row('数据与隐私', 'Data and privacy', 'Datos y privacidad', 'Données et confidentialité', 'データとプライバシー', 'Daten und Datenschutz', '데이터 및 개인정보', 'Dati e privacy', 'Dados e privacidade', 'डेटा और गोपनीयता'),
  open: row('回到开源版', 'Back to the open-source version', 'Volver a la versión de código abierto', 'Revenir à la version open source', 'オープンソース版に戻る', 'Zur Open-Source-Version', '오픈 소스 버전으로 돌아가기', 'Torna alla versione open source', 'Voltar à versão de código aberto', 'ओपन सोर्स संस्करण पर लौटें'),
  beta: row('内测版', 'Closed beta', 'Beta cerrada', 'Bêta fermée', 'クローズドベータ版', 'Geschlossene Beta', '비공개 베타', 'Beta chiusa', 'Beta fechado', 'बंद बीटा'),
  loading: row('正在准备…', 'Getting things ready…', 'Preparando todo…', 'Préparation en cours…', '準備中…', 'Wird vorbereitet…', '준비 중…', 'Preparazione in corso…', 'Preparando…', 'तैयारी हो रही है…'),
  reload: row('重新加载', 'Reload', 'Recargar', 'Recharger', '再読み込み', 'Neu laden', '다시 불러오기', 'Ricarica', 'Recarregar', 'फिर से लोड करें'),
  enableScripts: row('练习功能需要 JavaScript。', 'Practice features need JavaScript.', 'Las funciones de práctica necesitan JavaScript.', 'Les exercices nécessitent JavaScript.', '練習機能にはJavaScriptが必要です。', 'Die Übungen benötigen JavaScript.', '연습 기능을 이용하려면 JavaScript가 필요해요.', 'Per esercitarti serve JavaScript.', 'Os exercícios precisam de JavaScript.', 'अभ्यास के लिए JavaScript ज़रूरी है।'),
  unavailable: row('暂时无法加载', 'Could not load', 'No se pudo cargar', 'Chargement impossible', '読み込めませんでした', 'Laden fehlgeschlagen', '불러오지 못했어요', 'Impossibile caricare', 'Não foi possível carregar', 'लोड नहीं हो सका'),
  retryBody: row('请检查网络连接后重试。', 'Check your connection and try again.', 'Revisa tu conexión y vuelve a intentarlo.', 'Vérifiez votre connexion, puis réessayez.', '接続を確認して、もう一度お試しください。', 'Prüfe die Verbindung und versuche es erneut.', '연결을 확인한 뒤 다시 시도해 주세요.', 'Controlla la connessione e riprova.', 'Confira a conexão e tente de novo.', 'अपना कनेक्शन जाँचें और फिर कोशिश करें।'),
  download: row('下载备份', 'Download backup', 'Descargar copia', 'Télécharger la sauvegarde', 'バックアップをダウンロード', 'Sicherung herunterladen', '백업 다운로드', 'Scarica il backup', 'Baixar backup', 'बैकअप डाउनलोड करें'),
  repository: row('GitHub 源码', 'Source on GitHub', 'Código en GitHub', 'Code source sur GitHub', 'GitHubのソースコード', 'Quellcode auf GitHub', 'GitHub 소스 코드', 'Codice sorgente su GitHub', 'Código no GitHub', 'GitHub पर सोर्स कोड'),
  license: row('使用许可', 'License', 'Licencia', 'Licence', 'ライセンス', 'Lizenz', '라이선스', 'Licenza', 'Licença', 'लाइसेंस'),
  issues: row('提交问题', 'Report an issue', 'Informar de un problema', 'Signaler un problème', '問題を報告', 'Problem melden', '문제 신고', 'Segnala un problema', 'Relatar um problema', 'समस्या की रिपोर्ट करें'),
  contact: row('隐私联系', 'Privacy contact', 'Contacto de privacidad', 'Contact pour la confidentialité', 'プライバシーのお問い合わせ', 'Datenschutzkontakt', '개인정보 문의', 'Contatto per la privacy', 'Contato de privacidade', 'गोपनीयता संपर्क'),
  updated: row('更新日期', 'Updated', 'Actualizado', 'Mis à jour', '更新日', 'Stand', '업데이트', 'Aggiornato', 'Atualizado', 'अद्यतन'),
  backup: row(
    '完整 ZIP 备份未加密，包含模型 API Key。清除站点数据前可先导出备份，切勿把含密钥的备份发到公开渠道。',
    'Full ZIP backups are unencrypted and include your model API keys. Export one before clearing site data, and keep it out of public channels.',
    'El ZIP completo incluye las claves de API y no está cifrado. Puedes exportarlo antes de borrar los datos del sitio. Evita compartirlo en canales públicos.',
    'Le ZIP complet contient vos clés d’API et n’est pas chiffré. Exportez-le avant d’effacer les données du site et gardez-le hors des canaux publics.',
    '完全バックアップのZIPは暗号化されておらず、モデルのAPIキーが含まれます。サイトデータの消去前に書き出し、公開の場所では共有しないでください。',
    'Die vollständige ZIP-Sicherung ist unverschlüsselt und enthält deine Modell-API-Schlüssel. Exportiere sie vor dem Löschen der Websitedaten und teile sie nicht öffentlich.',
    '전체 ZIP 백업은 암호화되지 않으며 모델 API 키가 포함돼요. 사이트 데이터를 지우기 전에 내보내고 공개 채널에는 올리지 마세요.',
    'Il backup ZIP completo non è cifrato e include le chiavi API dei modelli. Esportalo prima di cancellare i dati del sito e non condividerlo in canali pubblici.',
    'O ZIP completo não é criptografado e inclui as chaves de API dos modelos. Exporte-o antes de apagar os dados do site e mantenha-o fora de canais públicos.',
    'पूरा ZIP बैकअप एन्क्रिप्टेड नहीं है और उसमें मॉडल की API कुंजियाँ हैं। साइट का डेटा मिटाने से पहले उसे निर्यात करें और सार्वजनिक चैनलों पर साझा न करें।',
  ),
  session: row(
    '注册使用邀请码，密码以哈希保存。登录 Cookie 用于维持会话，退出会结束当前会话，账号和学习记录仍可在下次登录时使用。',
    'Registration uses an invite code, and your password is stored as a hash. A sign-in cookie keeps your session active. Signing out ends that session and keeps your account and learning records available for your next sign-in.',
    'El registro usa un código de invitación y la contraseña se guarda como un hash. Una cookie mantiene tu sesión. Al salir se cierra esa sesión y puedes volver a acceder a tu cuenta y a tus registros.',
    'L’inscription utilise un code d’invitation et le mot de passe est stocké sous forme de hachage. Un cookie maintient la session. La déconnexion met fin à cette session et conserve le compte et les apprentissages.',
    '登録には招待コードを使い、パスワードはハッシュで保存します。ログインCookieでセッションを維持します。ログアウトすると現在のセッションが終了し、アカウントと学習記録は次回も利用できます。',
    'Für die Registrierung ist ein Einladungscode nötig. Dein Passwort wird als Hash gespeichert. Ein Cookie hält deine Sitzung aktiv. Beim Abmelden endet diese Sitzung, dein Konto und deine Lernaufzeichnungen bleiben erhalten.',
    '가입에는 초대 코드를 쓰며 비밀번호는 해시로 저장해요. 로그인 쿠키로 세션을 유지해요. 로그아웃하면 현재 세션이 끝나고 계정과 학습 기록은 다음 로그인 때 이용할 수 있어요.',
    'Per registrarti usi un codice d’invito e la password è salvata come hash. Un cookie mantiene la sessione. Uscire termina la sessione e conserva l’account e i dati di apprendimento.',
    'O cadastro usa um código de convite, e a senha é armazenada como hash. Um cookie mantém a sessão ativa. Ao sair, a sessão é encerrada e a conta e os registros continuam disponíveis no próximo acesso.',
    'पंजीकरण के लिए आमंत्रण कोड इस्तेमाल होता है और पासवर्ड हैश के रूप में सहेजा जाता है। कुकी से सत्र चालू रहता है। साइन आउट करने से मौजूदा सत्र खत्म होता है और खाता व सीखने के रिकॉर्ड अगले साइन इन पर उपलब्ध रहते हैं।',
  ),
}

export function publicWords(locale: UiLocale) {
  const at = UI_LOCALES.indexOf(locale)
  return Object.fromEntries(Object.entries(words).map(([key, texts]) => [key, texts[at]])) as Record<keyof typeof words, string>
}
