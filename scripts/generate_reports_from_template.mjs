import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const templatePath =
  process.argv[2] ||
  "c:\\Users\\Admin\\OneDrive\\Рабочий стол\\Work\\Theraply project\\Доповіді\\Theraply_Report_2026-04-18.docx";
const outputDirectory =
  process.argv[3] ||
  "c:\\Users\\Admin\\OneDrive\\Рабочий стол\\Work\\Theraply project\\Доповіді";

const reports = [
  {
    date: "2026-04-20",
    goal:
      "Розпочати Phase 9 — інтеграцію Google Calendar, закласти технічний фундамент інтеграції та підготувати систему до реального calendar-based booking flow.",
    workItems: [
      "Узгоджено фінальний сценарій Google Calendar інтеграції. Було зафіксовано, що терапевт підключає власний Google-акаунт, система читає availability з Google Calendar, а після confirm бронювання створює calendar event і meeting link.",
      "Підготовлено Google Cloud конфігурацію. Було визначено потрібні OAuth credentials, redirect URI та оновлено env-шаблони й документацію під Google Calendar integration.",
      "Розширено Prisma-схему під інтеграцію. До TherapistProfile додано поля для збереження Google Calendar connection, токенів і стану підключення, а до Session — поля для Google event metadata та meeting link synchronization.",
      "Створено й застосовано міграцію під Google Calendar integration. Також було оновлено seed-дані для therapist profiles, щоб нова схема коректно підтримувалась у тестовому середовищі.",
      "Підготовлено server-side helper layer для роботи з Google API. Було створено окремі модулі для OAuth config, OAuth client і Google Calendar client, щоб інтеграційна логіка не розмазувалась по різних частинах проєкту.",
      "Закладено основу therapist OAuth flow. Було реалізовано connect/callback підхід для підключення Google-акаунта терапевта як цільової моделі інтеграції.",
    ],
    result:
      "На кінець дня система вже мала узгоджену модель Google Calendar integration, готову конфігурацію, оновлену базу даних і базовий server-side integration layer для подальшої реалізації connect flow та availability synchronization.",
    conclusion:
      "За день було закладено повний технічний фундамент Phase 9. Проєкт підготовлено до переходу від локальної логіки слотів до реальної інтеграції з Google Calendar.",
  },
  {
    date: "2026-04-21",
    goal:
      "Реалізувати робочий therapist Google Calendar connection flow і підготувати систему до читання реального availability із Google Calendar.",
    workItems: [
      "Реалізовано Google OAuth client і server-side auth helper-и. Було завершено ініціалізацію OAuth flow, token exchange, refresh logic і зв’язок із server-side Google Calendar service.",
      "Реалізовано підключення Google-акаунта для терапевта. Додано connect route, callback route, збереження токенів і calendar data в БД, а також відображення connection status у therapist settings.",
      "Додано отримання списку доступних календарів і вибір target calendar. Терапевт отримав можливість бачити реальні calendars зі свого Google-акаунта та зберігати конкретний googleCalendarId для подальшої роботи системи.",
      "Реалізовано availability service через Google freeBusy API. Було створено окремий server-side шар, який читає busy intervals із Google Calendar і перетворює їх у нормалізований список слотів для booking flow.",
      "Підготовлено mapping logic для слотів і внутрішню нормалізацію availability ranges, щоб існуючий booking UI міг працювати вже не з mock-даними, а з реальними calendar-based intervals.",
    ],
    result:
      "На кінець дня терапевт уже міг реально підключити свій Google Calendar, вибрати цільовий календар, а бекенд отримав робочу логіку читання availability через Google freeBusy.",
    conclusion:
      "За день інтеграція перейшла з рівня підготовленої архітектури в реальний робочий connect flow. Це дало змогу перейти до повного підключення availability до booking process.",
  },
  {
    date: "2026-04-22",
    goal:
      "Інтегрувати Google Calendar availability у booking flow та забезпечити узгоджену синхронізацію бронювань із реальними подіями календаря.",
    workItems: [
      "Підключено availability service до існуючого booking flow. Було замінено внутрішню локальну логіку слотів на реальний Google Calendar availability із fallback-поведінкою, якщо інтеграція ще не завершена.",
      "Додано захист від конфліктів під час створення booking. Перед створенням запису система тепер повторно перевіряє availability, враховує Google busy ranges і локальні booking conflicts, а також блокує race conditions.",
      "Реалізовано створення Google Calendar event після therapist confirm. Після підтвердження booking система створює подію в календарі терапевта, ініціює Google Meet link і зберігає event metadata в Session.",
      "Додано синхронізацію reject/cancel сценаріїв із Google Calendar. Якщо booking відхиляється або скасовується, система видаляє або очищає пов’язану calendar event, щоб не лишати висячих подій у календарі.",
      "Посилено узгодженість між платформою та Google Calendar на рівні booking lifecycle, щоб стани в БД, booking UI та Google Calendar лишались синхронними.",
    ],
    result:
      "На кінець дня booking flow уже працював із реальними Google Calendar slots, захищався від конфліктних бронювань, а confirm/reject/cancel сценарії були синхронізовані з календарними подіями та Google Meet link.",
    conclusion:
      "За день було завершено головну операційну частину Phase 9 — платформа почала працювати не зі штучними слотами, а з реальним Google Calendar як джерелом правди для availability.",
  },
  {
    date: "2026-04-23",
    goal:
      "Завершити Phase 9 на рівні UX, auditability і документації та паралельно підготувати архітектурний фундамент для Phase 10: Stripe payments.",
    workItems: [
      "Додано UI-індикатори Google Calendar integration. У therapist dashboard і booking details було виведено статус підключення календаря, джерело meeting link і повідомлення про можливі інтеграційні проблеми.",
      "Реалізовано audit logging і технічну діагностику для Google Calendar lifecycle. Система почала логувати connect/disconnect, create/delete event, availability read issues і критичні помилки інтеграції.",
      "Оновлено документацію та env-шаблони під фінальний стан Google Calendar integration. Було синхронізовано README, README.ua і env examples відповідно до фактичної реалізації Phase 9.",
      "Розпочато Phase 10: Stripe payments. Було зафіксовано бізнес-логіку оплати: повна оплата сесії, валюта GBP, therapist-based pricing, обов’язкова оплата після therapist confirm і payment deadline за 24 години до сесії.",
      "Підготовлено Stripe env placeholders і розширено Prisma-схему під payments, therapist pricing і client credit logic. Було додано нові payment/refund/credit поля, моделі credit balance/transactions і therapist session price.",
      "Створено та застосовано міграцію під payment schema, а також підключено Stripe SDK і server-side Stripe config layer для подальшої реалізації checkout flow.",
    ],
    result:
      "На кінець дня Phase 9 було фактично завершено як цілісний інтеграційний блок, а для Phase 10 уже був готовий початковий технічний фундамент: schema, migration, env placeholders і Stripe config layer.",
    conclusion:
      "За день проєкт пройшов межу між calendar integration phase і billing phase: Google Calendar integration була доведена до продуктового стану, а Stripe payments — підготовлені до практичної реалізації.",
  },
  {
    date: "2026-04-24",
    goal:
      "Перевести Phase 10 з підготовленого фундаменту в реальний payment flow для клієнта та закласти основу під подальші webhook/refund сценарії.",
    workItems: [
      "Реалізовано therapist pricing у server/UI flow. Ціна сесії тепер задається в therapist settings у GBP, зберігається в БД у pence і показується клієнту в booking flow до створення оплати.",
      "Побудовано payment eligibility logic. Було створено окремий server-side сервіс, який визначає, чи може booking бути оплачений, з урахуванням booking status, therapist price, payment deadline та поточного payment status.",
      "При therapist confirm booking тепер автоматично отримує paymentDueBy, щоб правило оплати не пізніше ніж за 24 години до сесії реально жило в доменній моделі системи.",
      "Реалізовано створення Stripe Checkout Session. Було додано payment service method і API route, які перевіряють eligibility, створюють Stripe Checkout, передають metadata та синхронізують Payment record у статусі PENDING.",
      "Додано payment button у client UI. У booking details з’явилась реальна кнопка Pay now, яка запускає POST /api/stripe/checkout, обробляє loading/error states і перенаправляє клієнта на Stripe-hosted checkout.",
      "Після кожного завершеного кроку виконувалась перевірка збірки через npm run build, щоб новий payment layer не ламав загальну стабільність проєкту.",
    ],
    result:
      "На кінець дня проєкт отримав робочий початок реального payment flow: therapist pricing, payment readiness logic, server-side Stripe Checkout session creation і client-side запуск checkout із кабінету клієнта.",
    conclusion:
      "За день було реалізовано перший повноцінний billing workflow у межах MVP. Phase 10 перейшла з рівня підготовки в практичну інтеграцію платежів і тепер готова до наступних кроків — success/failed pages, webhooks, refunds і credit handling.",
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

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "theraply-reports-"));
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
