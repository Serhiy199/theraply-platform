# -*- coding: utf-8 -*-
import os
import zipfile
from xml.sax.saxutils import escape

ROOT = r"\\wsl.localhost\Ubuntu\home\serhiy_dev\projects\theraply-platform"

REPORTS = [
    (
        "Theraply_Report_Day_1_2026-04-14_UA_FINAL.docx",
        "Доповідь про виконану роботу за День 1",
        [
            "Проєкт: Theraply Platform",
            "",
            "Мета роботи за день",
            "Розпочати реалізацію operational-функціоналу платформи після завершення базового dashboard foundation, підготувати спільний server-side шар для роботи з bookings, sessions, payments і roles.",
            "",
            "Виконані роботи",
            "1. Підготовка спільного service layer.",
            "Було закладено основу для подальших модулів client, therapist і admin: визначено спільні data contracts та описано shape даних для списків booking-ів, деталей booking-а, payment summary, therapist request item і admin booking row.",
            "",
            "2. Реалізація окремих server-side сервісів.",
            "Було створено окремі доменні сервіси: client-bookings.service.ts, therapist-bookings.service.ts, admin-operations.service.ts. У цих сервісах закладено читання booking/session/payment даних для різних ролей, окремі role-specific сценарії та підготовку до mutation flows.",
            "",
            "3. Підготовка спільних UI-констант.",
            "Було винесено booking status labels, payment status labels, badge mappings, policy helpers і логіку для 24-hour cancellation warning.",
            "",
            "Результат на кінець дня",
            "Створено єдиний service layer для operational-модулів, закладено узгоджену модель даних між client, therapist і admin та підготовлено основу для побудови реальних role modules.",
            "",
            "Висновок",
            "За перший день було створено технічний фундамент для реалізації operational-функціоналу платформи. Це дозволило будувати клієнтський, терапевтичний та адмінський модулі на спільній і чистій доменній основі.",
        ],
    ),
    (
        "Theraply_Report_Day_2_2026-04-14_UA_FINAL.docx",
        "Доповідь про виконану роботу за День 2",
        [
            "Проєкт: Theraply Platform",
            "",
            "Мета роботи за день",
            "Реалізувати client module як перший повноцінний operational-модуль платформи.",
            "",
            "Виконані роботи",
            "1. Реалізація сторінки bookings для client.",
            "Було перетворено placeholder-сторінку на реальний модуль бронювань: додано upcoming sessions, past sessions, booking status і payment status.",
            "",
            "2. Реалізація booking details page.",
            "Було створено окрему сторінку деталей запису: therapist info, дата і час сесії, booking status, payment status, notes і session link, якщо він існує.",
            "",
            "3. Реалізація payments page.",
            "Було реалізовано окрему сторінку оплат клієнта: payment records, статуси оплат і зв’язок платежів з booking records.",
            "",
            "4. Реалізація client cancellation flow.",
            "Було додано кнопку скасування, server action для cancel, перевірку доступу на сервері, зміну booking state та попередження про late cancellation менше ніж за 24 години.",
            "",
            "Результат на кінець дня",
            "Клієнт отримав власний робочий модуль. Користувач уже може переглядати свої записи, бачити оплату і керувати скасуванням існуючих записів.",
            "",
            "Висновок",
            "За другий день було реалізовано повноцінний client module, який зробив приватну частину платформи не просто інтерфейсом, а вже робочим користувацьким кабінетом.",
        ],
    ),
    (
        "Theraply_Report_Day_3_2026-04-14_UA_FINAL.docx",
        "Доповідь про виконану роботу за День 3",
        [
            "Проєкт: Theraply Platform",
            "",
            "Мета роботи за день",
            "Реалізувати therapist module як повноцінне робоче місце терапевта.",
            "",
            "Виконані роботи",
            "1. Реалізація therapist requests module.",
            "Було створено реальний модуль заявок: список нових заявок, перегляд деталей запиту та server-side отримання request records.",
            "",
            "2. Реалізація therapist actions.",
            "Було додано підтвердження booking request, відхилення booking request, server-side role checks і синхронізацію booking/session state після рішення терапевта.",
            "",
            "3. Реалізація therapist clients page.",
            "Було створено сторінку списку клієнтів терапевта з прив’язкою клієнтів до booking-історії та зручним переглядом relationship records.",
            "",
            "4. Реалізація payout details.",
            "Було додано payout details page, форму оновлення payout data, server-side update flow і перевірку доступу за роллю THERAPIST.",
            "",
            "Результат на кінець дня",
            "Терапевт отримав робочий кабінет. З’явився повний therapist-side workflow: перегляд заявок, confirm/reject, робота з клієнтами та внесення payout details.",
            "",
            "Висновок",
            "За третій день було реалізовано повноцінне робоче місце терапевта, яке вже дозволяє працювати із запитами, майбутніми сесіями та власними виплатними реквізитами.",
        ],
    ),
    (
        "Theraply_Report_Day_4_2026-04-14_UA_FINAL.docx",
        "Доповідь про виконану роботу за День 4",
        [
            "Проєкт: Theraply Platform",
            "",
            "Мета роботи за день",
            "Реалізувати admin module та надати платформі базову операційну панель керування.",
            "",
            "Виконані роботи",
            "1. Реалізація сторінок users і therapists.",
            "Було реалізовано список клієнтів, список терапевтів, відображення approval-related станів і payout readiness.",
            "",
            "2. Реалізація bookings page.",
            "Було створено список усіх booking records: client, therapist, session time, booking status, payment status і переходи до booking details.",
            "",
            "3. Реалізація booking details і manual cancel.",
            "Було реалізовано окрему details page для booking, ручне скасування booking адміністратором, server-side mutation flow, оновлення session state і audit logging для admin actions.",
            "",
            "4. Реалізація payments і audit.",
            "Було додано payments page, перегляд платіжних записів, перегляд audit trail і відображення admin-level operational context.",
            "",
            "Результат на кінець дня",
            "Адміністратор отримав повноцінний operational-модуль. Адмін уже бачить users, therapists, bookings, payments і audit trail, а платформа отримала базовий рівень ручного контролю.",
            "",
            "Висновок",
            "За четвертий день було реалізовано повноцінну адмін-панель MVP-рівня, яка дає команді Theraply контроль над користувачами, записами, оплатами та змінами в системі.",
        ],
    ),
    (
        "Theraply_Report_Day_5_2026-04-14_UA_FINAL.docx",
        "Доповідь про виконану роботу за День 5",
        [
            "Проєкт: Theraply Platform",
            "",
            "Мета роботи за день",
            "Завершити operational-блок Етапів 5-7, підсилити rules/access layer і провести polishing приватної зони.",
            "",
            "Виконані роботи",
            "1. Захист mutation flows.",
            "Було додано жорсткі server-side role guards для client actions, therapist actions, admin actions і payout update flow.",
            "",
            "2. Уніфікація permission layer.",
            "Було винесено спільний guard-підхід: перевірка ролі в точці виконання action, уніфікована логіка відмови доступу і захист від неправильного виклику actions не тією роллю.",
            "",
            "3. Empty, loading і error states.",
            "Було реалізовано спільні UX-стани для всіх ролей: empty states, loading states, status alerts і success/error feedback.",
            "",
            "4. Підсумкова перевірка operational-блоку.",
            "Було виконано build verification і smoke-test логіку для client module, therapist module та admin module.",
            "",
            "Результат на кінець дня",
            "Етапи 5-7 було закрито як єдиний функціональний блок. Operational MVP став стабільним і захищеним на серверному рівні, а приватна зона стала значно завершенішою з погляду UX.",
            "",
            "Висновок",
            "За п’ятий день було доведено до завершення великий operational-блок платформи та забезпечено правильний рівень захисту й стабільності mutation flows.",
        ],
    ),
    (
        "Theraply_Report_Day_6_2026-04-14_UA_FINAL.docx",
        "Доповідь про виконану роботу за День 6",
        [
            "Проєкт: Theraply Platform",
            "",
            "Мета роботи за день",
            "Реалізувати Phase 8 — повний booking flow end-to-end, а також синхронізувати документацію проєкту з фактичним станом системи.",
            "",
            "Виконані роботи",
            "1. Реалізація booking flow service.",
            "Було створено окремий доменний сервіс booking-flow.service.ts. У ньому реалізовано список доступних терапевтів, отримання availability slots, створення booking request, confirm/reject booking request і meeting link handling.",
            "",
            "2. Реалізація client booking flow.",
            "Було створено нові маршрути /client/book/new і /client/book/[therapistId]. Реалізовано сторінку вибору терапевта, сторінку доступних слотів, створення booking request і conflict-aware UX.",
            "",
            "3. Інтеграція therapist workflow з booking flow.",
            "Було підключено існуючі therapist confirm/reject actions до нового booking service, щоб booking flow став єдиним сценарієм між client і therapist.",
            "",
            "4. Реалізація meeting link handling.",
            "Було додано автоматичну генерацію meeting link після therapist confirmation, збереження meeting link у Session і відображення session link у деталях booking-а.",
            "",
            "5. Реалізація booking flow states.",
            "Було додано empty states, loading states, conflict states і success/error feedback для booking flow.",
            "",
            "6. Підсумкова перевірка і документація.",
            "Було виконано npm run build, коротку перевірку npm run dev, окремий verification script для Phase 8, оновлення README.md, повне переписування README.ua.md коректною українською мовою в UTF-8 і синхронізацію англійської та української документації.",
            "",
            "Результат на кінець дня",
            "Phase 8 було повністю завершено. Основний booking flow працює end-to-end, документація приведена до актуального стану, а проєкт має вже не лише dashboards і operational modules, а й реальний головний бізнес-процес бронювання.",
            "",
            "Висновок",
            "За шостий день було реалізовано ключовий бізнес-функціонал системи — booking flow — та синхронізовано документацію з фактичним станом проєкту. Це суттєво наблизило Theraply до стану реального продуктового MVP.",
        ],
    ),
]

CONTENT_TYPES = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>'''

RELS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>'''

APP = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
            xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft Office Word</Application>
</Properties>'''


def p(text: str) -> str:
    if text == "":
        return "<w:p/>"
    return f"<w:p><w:r><w:t>{escape(text)}</w:t></w:r></w:p>"


def build_docx(path: str, title: str, lines: list[str]) -> None:
    core = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:dcmitype="http://purl.org/dc/dcmitype/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>{escape(title)}</dc:title>
  <dc:creator>Codex</dc:creator>
  <cp:lastModifiedBy>Codex</cp:lastModifiedBy>
</cp:coreProperties>'''

    body = [p(title), p("")]
    body.extend(p(line) for line in lines)
    document = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
 xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
 xmlns:v="urn:schemas-microsoft-com:vml"
 xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
 xmlns:w10="urn:schemas-microsoft-com:office:word"
 xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
 xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
 xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
 xmlns:wne="http://schemas.openxmlformats.org/officeDocument/2006/wordml"
 xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
 mc:Ignorable="w14 wp14">
  <w:body>
    {''.join(body)}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>'''

    with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('[Content_Types].xml', CONTENT_TYPES.encode('utf-8'))
        zf.writestr('_rels/.rels', RELS.encode('utf-8'))
        zf.writestr('docProps/app.xml', APP.encode('utf-8'))
        zf.writestr('docProps/core.xml', core.encode('utf-8'))
        zf.writestr('word/document.xml', document.encode('utf-8'))

for filename, title, lines in REPORTS:
    build_docx(os.path.join(ROOT, filename), title, lines)
    with zipfile.ZipFile(os.path.join(ROOT, filename), 'r') as zf:
        sample = zf.read('word/document.xml').decode('utf-8')
        if 'Доповідь про виконану роботу' not in sample:
            raise RuntimeError(f'Unicode verification failed for {filename}')

print('\n'.join(filename for filename, _, _ in REPORTS))