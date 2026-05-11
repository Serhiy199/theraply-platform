import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const templatePath =
  process.argv[2] ||
  "C:\\Users\\Admin\\OneDrive\\Рабочий стол\\Work\\Theraply project\\Доповіді\\Theraply_Report_2026-04-27.docx";
const outputDirectory =
  process.argv[3] ||
  "C:\\Users\\Admin\\OneDrive\\Рабочий стол\\Work\\Theraply project\\Доповіді";

const reports = [
  {
    date: "2026-04-29",
    goal:
      "Стабілізувати client booking request flow після завершення календарної інтеграції, прибрати критичні runtime-помилки в confirm/request сценаріях і довести базовий життєвий цикл запиту до робочого стану.",
    workItems: [
      "Було усунуто критичні помилки в client booking request flow. Під час створення запиту на сесію кабінет клієнта падав через особливості Next.js 16 server actions: use server файли експортували не лише async functions, а й звичайні initial state objects. Цей патерн було виправлено в booking request action, після чого клієнтський submit перестав валити сторінку.",
      "Було виправлено серверну проблему в transaction locking під час створення booking request. Раніше advisory lock викликав помилку Prisma через повернення void-типу в raw query. Логіку було скориговано так, щоб блокування коректно працювало на рівні транзакції і не ламало створення запиту.",
      "Було стабілізовано therapist-side confirm/reject flow. Аналогічна помилка з use server exports проявлялась і при підтвердженні запиту терапевтом. Після перенесення initial state у client component therapist request details знову почав коректно обробляти confirm і reject дії без падіння кабінету.",
      "Було доведено до робочого стану базову навігацію booking lifecycle. Після створення запиту клієнт тепер перенаправляється на booking details page, де бачить статус запиту, терапевта, session timing, readiness до оплати та подальші сценарії, а не залишається без контексту після submit.",
      "Було реалізовано therapist-side post-confirm cancellation scenario. Після підтвердження сесії терапевт отримав окрему дію Cancel session, а система почала коректно скасовувати booking, синхронізувати стан з клієнтом і підготовлювати compensation flow для paid-case сценаріїв.",
      "Було перевірено фактичний сценарій створення Google Calendar event і Google Meet link після confirm. Підтверджено, що після therapist approval booking переходить у confirmed state, у календар надсилається подія, а meeting link з’являється в booking details.",
    ],
    result:
      "На кінець дня базовий booking request lifecycle знову працював стабільно: клієнт міг створити запит, терапевт — переглянути і підтвердити його, а система коректно переходила до деталей бронювання без runtime-падінь.",
    conclusion:
      "За день було прибрано критичні технічні збої, які блокували реальне тестування запитів на сесії. Це повернуло платформу до стабільного operational state і створило основу для подальшого тестування оплати та post-confirm сценаріїв.",
  },
  {
    date: "2026-04-30",
    goal:
      "Довести Phase 10 payment flow і booking UX до стабільного продуктового стану: прибрати проблеми з кнопками, уніфікувати повторювані UI-патерни, обмежити запізніле бронювання, синхронізувати часові зони та виправити success redirect після Stripe Checkout.",
    workItems: [
      "Було усунуто проблему з відображенням тексту в CTA-кнопках. Через глобальний CSS reset із color: inherit частина dark buttons візуально втрачала текст. Спочатку було виконано локальні виправлення, а далі створено централізований Button/ButtonLink компонент із керованими variant, loading state і явним контролем text color.",
      "Було створено спільний Badge компонент і винесено повторювані статусні мітки в один централізований шар. Це уніфікувало booking/payment status chips у client, therapist та admin кабінетах і дало можливість керувати їхнім виглядом з одного місця.",
      "Було виконано окремий рефактор повторюваних soft-card / alert / stat-card патернів. Для цього створено спільні UI-примітиви для карток, inset blocks, alert-плашок і stat surfaces, після чого повторювані dashboard і booking UI-патерни були переведені на єдину компонентну основу.",
      "Було додано обмеження на booking lead time: клієнт більше не може створювати booking request менш ніж за 25 годин до початку сесії. Це вирівняло бізнес-логіку бронювання з правилом оплати не пізніше ніж за 24 години до підтвердженої сесії та прибрало непридатні для оплати late-booking сценарії.",
      "Було виправлено відображення часових значень у therapist, client та admin кабінетах. Раніше списки й details pages могли показувати різний час для одного й того ж booking-а через різні timezone contexts у server і client components. Було додано спільний formatter із явним Europe/London timezone, і ключові booking/payment/request surfaces були синхронізовані.",
      "Було виправлено success redirect після Stripe Checkout. У success URL placeholder {CHECKOUT_SESSION_ID} раніше URL-encoded-ився, через що success page отримувала не реальний Stripe session id, а буквальний шаблон і падала з помилкою No such checkout.session. Генерацію success_url було скориговано, а success reconciliation зроблено стійким до битого session_id.",
      "Було покращено логіку відображення успішної оплати. Success page і payment flow були змінені так, щоб після повернення зі Stripe booking міг одразу синхронізуватись у paid state, а користувач не бачив суперечливу комбінацію success redirect із pending payment status.",
    ],
    result:
      "На кінець дня payment UX, booking UX і повторювані UI-патерни були суттєво стабілізовані: кнопки й бейджі централізовані, card/alert primitives уніфіковані, запізнілі бронювання заблоковані, часові зони вирівняні, а success redirect після Stripe Checkout більше не ламався.",
    conclusion:
      "За день було виконано важливу стабілізацію продуктового шару навколо оплати, часу та повторюваних інтерфейсних компонентів. Це суттєво зменшило кількість локальних UI-фіксів і підвищило передбачуваність end-to-end сценаріїв бронювання та оплати.",
  },
  {
    date: "2026-05-03",
    goal:
      "Розпочати Phase 11 навколо onboarding та email verification: закласти модель даних, перебудувати registration flow під верифікацію email і підготувати систему до therapist onboarding state machine.",
    workItems: [
      "Було розширено Prisma-схему для email verification. До User моделі додано поля, потрібні для контролю стану підтвердження email, а також створено окрему міграцію під email verification tokens як основу для подальшого verification flow.",
      "Було оновлено approval-модель therapist profiles. Статусна модель therapist approval була переведена на новий enum-підхід, а TherapistProfile отримав onboarding-поля, які потрібні для покрокового проходження терапевтичного onboarding flow.",
      "Було додано індекси й оновлено seed-дані під майбутні therapist onboarding і email verification сценарії. Це підготувало базу не лише до нового auth flow, а й до ефективнішої роботи майбутніх перевірок і вибірок.",
      "Було оновлено auth validation і registration logic. Registration action та auth service були перебудовані під verification-first модель, де реєстрація більше не завершує onboarding повністю, а переводить користувача в сценарій підтвердження email.",
      "Було оновлено RegisterForm UI і тексти. Користувацькі повідомлення й success states були адаптовані так, щоб новий registration flow пояснював користувачу необхідність email verification замість старої логіки простого завершення реєстрації.",
      "Було синхронізовано документацію під новий етап. У docs/phase-11-client-therapist-onboarding.md почали фіксуватись schema decisions, auth-flow changes і структура майбутнього onboarding блоку.",
    ],
    result:
      "На кінець дня проект отримав готовий data-layer і auth foundation для email verification та therapist onboarding. Registration flow був перебудований під нову логіку, а база даних підготовлена до подальшої реалізації verification і onboarding сценаріїв.",
    conclusion:
      "За день було закладено повний технічний фундамент Phase 11. Платформа перейшла від старої моделі простої реєстрації до керованого verification/onboarding-підходу, що відкриває можливість для більш контрольованого запуску клієнтів і терапевтів у систему.",
  },
  {
    date: "2026-05-04",
    goal:
      "Завершити робочий цикл Phase 11: реалізувати email delivery та verification flow, додати resend і verify routes, ув’язати onboarding із role-based доступом і довести therapist/client onboarding сценарії до тестованого стану.",
    workItems: [
      "Було створено email delivery abstraction. Це винесло логіку надсилання листів у окремий сервісний шар і підготувало платформу до централізованої відправки verification листів та подальших transactional email сценаріїв.",
      "Було створено email verification service. У сервісі реалізовано генерацію verification token, перевірку строку життя токена, логіку позначення email як verified і server-side основу для resend verification flow.",
      "Було реалізовано route /verify-email/[token] і пов’язану сторінку підтвердження. Користувач тепер може перейти за verification link із листа, пройти підтвердження email і отримати коректний UX-результат замість ручного технічного сценарію.",
      "Було реалізовано resend email verification action та окрему форму для повторного надсилання verification листа. Це закрило практичний кейс, коли користувач не отримав або втратив первинний verification email.",
      "Було ув’язано verification flow з auth, redirects, permissions та dashboard routes. Тепер система розрізняє verified / unverified користувачів, коректно спрямовує їх у дозволені сторінки та не пропускає далі у flow, якщо verification або onboarding ще не завершені.",
      "Було реалізовано therapist onboarding page, validation schema, contracts і constants. Це дозволило закласти окремий керований сценарій активації терапевта поверх email verification flow.",
      "Було створено verification scripts verify:phase11-email та verify:email-records, а також синхронізовано документацію. Це дало окремий технічний шар перевірки для email/onboarding етапу й полегшило подальше regression testing.",
      "Паралельно було усунуто низку багів у registration, forgot-password і reset-password actions, щоб новий verification-centered auth flow не ламав суміжні сценарії доступу до акаунта.",
    ],
    result:
      "На кінець дня Phase 11 перейшла в робочий стан: email delivery abstraction, verification service, verify-email route, resend flow, therapist onboarding validation і технічні verification scripts були реалізовані й пов’язані в єдиний сценарій.",
    conclusion:
      "За день було завершено ключовий onboarding/email verification блок, який тепер працює як реальний operational flow, а не як набір окремих підготовчих змін. Платформа отримала керований механізм активації користувачів і основу для наступних email-driven сценаріїв.",
  },
];

function writeUtf8Bom(filePath, content) {
  fs.writeFileSync(filePath, `\uFEFF${content}`, "utf8");
}

function runPowerShellFile(scriptPath, args) {
  return execFileSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...args],
    { encoding: "utf8" },
  );
}

function xmlEscape(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function paragraphXml(
  text,
  {
    bold = false,
    align = "left",
    size = 24,
    spacingBefore = 0,
    spacingAfter = 120,
  } = {},
) {
  const jc = align === "center" ? '<w:jc w:val="center"/>' : "";
  const boldXml = bold ? "<w:b/><w:bCs/>" : "";
  return `<w:p>
  <w:pPr>
    ${jc}
    <w:spacing w:before="${spacingBefore}" w:after="${spacingAfter}"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      ${boldXml}
      <w:sz w:val="${size}"/>
      <w:szCs w:val="${size}"/>
    </w:rPr>
    <w:t xml:space="preserve">${xmlEscape(text)}</w:t>
  </w:r>
</w:p>`;
}

function emptyParagraphXml() {
  return `<w:p>
  <w:pPr>
    <w:spacing w:after="120"/>
  </w:pPr>
</w:p>`;
}

function buildDocumentXml(report, sectPrXml) {
  const date = new Date(`${report.date}T00:00:00`);
  const dateLabel = date.toLocaleDateString("uk-UA");
  const paragraphs = [];

  paragraphs.push(
    paragraphXml(`Доповідь про виконану роботу за ${dateLabel}`, {
      bold: true,
      size: 30,
      align: "center",
      spacingAfter: 200,
    }),
  );
  paragraphs.push(
    paragraphXml("Проєкт: Theraply Platform", {
      bold: true,
      size: 24,
      spacingAfter: 200,
    }),
  );
  paragraphs.push(
    paragraphXml("Мета роботи за день", {
      bold: true,
      size: 24,
      spacingAfter: 80,
    }),
  );
  paragraphs.push(
    paragraphXml(report.goal, {
      size: 24,
      spacingAfter: 180,
    }),
  );
  paragraphs.push(
    paragraphXml("Виконані роботи", {
      bold: true,
      size: 24,
      spacingAfter: 80,
    }),
  );

  report.workItems.forEach((item, index) => {
    paragraphs.push(
      paragraphXml(`${index + 1}. ${item}`, {
        size: 24,
        spacingAfter: 80,
      }),
    );
  });

  paragraphs.push(emptyParagraphXml());
  paragraphs.push(
    paragraphXml("Результат на кінець дня", {
      bold: true,
      size: 24,
      spacingAfter: 80,
    }),
  );
  paragraphs.push(
    paragraphXml(report.result, {
      size: 24,
      spacingAfter: 180,
    }),
  );
  paragraphs.push(
    paragraphXml("Висновок", {
      bold: true,
      size: 24,
      spacingAfter: 80,
    }),
  );
  paragraphs.push(
    paragraphXml(report.conclusion, {
      size: 24,
      spacingAfter: 120,
    }),
  );

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" xmlns:cx1="http://schemas.microsoft.com/office/drawing/2015/9/8/chartex" xmlns:cx2="http://schemas.microsoft.com/office/drawing/2015/10/21/chartex" xmlns:cx3="http://schemas.microsoft.com/office/drawing/2016/5/9/chartex" xmlns:cx4="http://schemas.microsoft.com/office/drawing/2016/5/10/chartex" xmlns:cx5="http://schemas.microsoft.com/office/drawing/2016/5/11/chartex" xmlns:cx6="http://schemas.microsoft.com/office/drawing/2016/5/12/chartex" xmlns:cx7="http://schemas.microsoft.com/office/drawing/2016/5/13/chartex" xmlns:cx8="http://schemas.microsoft.com/office/drawing/2016/5/14/chartex" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:aink="http://schemas.microsoft.com/office/drawing/2016/ink" xmlns:am3d="http://schemas.microsoft.com/office/drawing/2017/model3d" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:oel="http://schemas.microsoft.com/office/2019/extlst" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex" xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid" xmlns:w16="http://schemas.microsoft.com/office/word/2018/wordml" xmlns:w16du="http://schemas.microsoft.com/office/word/2023/wordml/word16du" xmlns:w16sdtdh="http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash" xmlns:w16sdtfl="http://schemas.microsoft.com/office/word/2024/wordml/sdtformatlock" xmlns:w16se="http://schemas.microsoft.com/office/word/2015/wordml/symex" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 w15 w16se w16cid w16 w16cex w16sdtdh w16sdtfl w16du wp14">
  <w:body>
${paragraphs.join("\n")}
${sectPrXml}
  </w:body>
</w:document>`;
}

function extractSectPrXml(templateDocXml) {
  const match = templateDocXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
  if (!match) {
    throw new Error("Could not extract <w:sectPr> from template.");
  }
  return match[0];
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "theraply-reports-post-0427-"));
const extractScriptPath = path.join(tempDir, "extract-docxml.ps1");
const updateScriptPath = path.join(tempDir, "update-docxml.ps1");

writeUtf8Bom(
  extractScriptPath,
  [
    "param([string]$DocxPath)",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    "$zip=[System.IO.Compression.ZipFile]::OpenRead($DocxPath)",
    "try {",
    "  $entry=$zip.GetEntry('word/document.xml')",
    "  if ($null -eq $entry) { throw 'word/document.xml not found' }",
    "  $reader=New-Object System.IO.StreamReader($entry.Open())",
    "  try { $xml=$reader.ReadToEnd() } finally { $reader.Dispose() }",
    "  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "  Write-Output $xml",
    "} finally { $zip.Dispose() }",
  ].join("\r\n"),
);

writeUtf8Bom(
  updateScriptPath,
  [
    "param([string]$DocxPath,[string]$XmlPath)",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    "Add-Type -AssemblyName System.IO.Compression",
    "$fileStream=[System.IO.File]::Open($DocxPath,[System.IO.FileMode]::Open,[System.IO.FileAccess]::ReadWrite)",
    "try {",
    "  $zip=New-Object System.IO.Compression.ZipArchive($fileStream,([System.IO.Compression.ZipArchiveMode]::Update),$false)",
    "  try {",
    "    $entry=$zip.GetEntry('word/document.xml')",
    "    if ($null -eq $entry) { throw 'word/document.xml not found' }",
    "    $entry.Delete()",
    "    $newEntry=$zip.CreateEntry('word/document.xml')",
    "    $writer=New-Object System.IO.StreamWriter($newEntry.Open(),[System.Text.UTF8Encoding]::new($false))",
    "    try { $writer.Write([System.IO.File]::ReadAllText($XmlPath,[System.Text.Encoding]::UTF8)) } finally { $writer.Dispose() }",
    "  } finally { $zip.Dispose() }",
    "} finally { $fileStream.Dispose() }",
  ].join("\r\n"),
);

if (!fs.existsSync(outputDirectory)) {
  fs.mkdirSync(outputDirectory, { recursive: true });
}

const templateDocumentXml = runPowerShellFile(extractScriptPath, [templatePath]);
const sectPrXml = extractSectPrXml(templateDocumentXml);

for (const report of reports) {
  const outputFileName = `Theraply_Report_${report.date}.docx`;
  const outputPath = path.join(outputDirectory, outputFileName);
  const xmlPath = path.join(tempDir, `${report.date}.xml`);
  const documentXml = buildDocumentXml(report, sectPrXml);

  fs.copyFileSync(templatePath, outputPath);
  fs.writeFileSync(xmlPath, documentXml, "utf8");
  runPowerShellFile(updateScriptPath, [outputPath, xmlPath]);
  console.log(`Generated: ${outputPath}`);
}
