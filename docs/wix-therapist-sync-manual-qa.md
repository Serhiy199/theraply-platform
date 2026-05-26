# Wix Therapist Sync Manual QA

## Мета

Перевірити, що Wix Forms integration доповнює admin approve flow, але не блокує
погодження терапевта у Theraply при помилці зовнішнього API.

## Безпечні умови виконання

- Live submission у Wix створюється лише для явно визначеного тестового профілю.
- Live approve/retry змінює віддалену БД і може створити новий response у Wix.
- Некоректний `WIX_API_TOKEN` для failure scenario змінюється лише на час
  контрольованого тесту та одразу відновлюється.
- У нотатках не зберігати token, `Authorization` header або raw provider response.

## Поточний стан перевірки: 26 травня 2026

| Сценарій | Статус | Evidence / notes |
| --- | --- | --- |
| Test submission видно у Wix Dashboard | PASS | У Wix Forms Responses видно `Test Therapist Sync` / `test.therapist.sync@example.com` на screenshot, наданому після live test endpoint run. |
| Неавторизований виклик dev endpoint | PASS | Runtime POST до `/api/admin/dev/test-wix-therapist-submission` без session повернув HTTP `401`. |
| Client/therapist не може викликати test endpoint | PASS | Runtime POST після login seeded client та seeded therapist повернув HTTP `403` для кожної ролі. |
| Production test endpoint недоступний | READY, NOT RUN LIVE | Route повертає `404` поза `development`, покрито unit/security verification; deployment-level request ще не запускався. |
| Missing token повертає українську помилку | READY, NOT RUN LIVE | Покрито unit test; runtime test потребує тимчасового вимкнення локального token і admin session. |
| Admin UI показує поточний Wix sync стан | PASS | Read-only admin login: сторінка `/admin/therapists` містить колонку `Wix Sync`, badge `Not synced` і кнопку `Retry sync to Wix`. |
| Successful approve sync | BLOCKED ON TEST PROFILE | У поточній БД немає `PENDING_REVIEW` profile; live run потребує створення/підготовки тестового therapist і створить Wix response. |
| Failed Wix sync після approve | BLOCKED ON TEST PROFILE | Потребує `PENDING_REVIEW` profile і тимчасового invalid token або контрольованої provider failure. |
| Retry після виправлення configuration | BLOCKED ON FAILED PROFILE | Потребує profile зі статусом `FAILED`; retry створить Wix response. |

## Read-only DB preflight

Зріз від 26 травня 2026, виконаний без зміни даних:

| Theraply approval status | Wix sync status | Count |
| --- | --- | ---: |
| `APPROVED` | `NOT_SYNCED` | 3 |
| `EMAIL_NOT_VERIFIED` | `NOT_SYNCED` | 1 |

Наразі відсутній profile у статусі `PENDING_REVIEW`, тому сценарій нового approve
не можна виконати без створення або підготовки окремих QA-даних.

## 1. Test Endpoint Scenario

### Pass path

1. Запустити app у `development`.
2. Увійти під admin account.
3. Викликати `POST /api/admin/dev/test-wix-therapist-submission`.
4. Перевірити JSON response:

```json
{
  "success": true,
  "message": "Тестовий запис успішно створено у Wix Forms.",
  "wixSubmissionId": "..."
}
```

5. У Wix Dashboard відкрити:
   `Clients -> Forms -> Therapist Application Form -> Responses`.
6. Перевірити `Test Therapist Sync` та `test.therapist.sync@example.com`.

Результат: запис у Wix Dashboard вже підтверджений live screenshot. Новий
submission під час цієї QA-сесії не створювався, щоб не дублювати response.

### Fail paths

| Check | Expected |
| --- | --- |
| Виклик без login | HTTP `401`, контрольоване повідомлення про admin authorization |
| Виклик як client або therapist | HTTP `403`, доступ лише адміністратору |
| Виклик у production | HTTP `404` |
| Admin call без `WIX_API_TOKEN` | HTTP `503`, `Не налаштовано WIX_API_TOKEN.` |

Runtime result: `401` без session, `403` для seeded client і `403` для seeded
therapist підтверджені локальним development запуском 26 травня 2026.

## 2. Successful Approve Sync Scenario

Передумова: окремий QA therapist має `approvalStatus = PENDING_REVIEW`.

1. Увійти як admin і відкрити `/admin/therapists`.
2. Погодити QA therapist.
3. Перевірити UI message:
   `Терапевта погоджено та синхронізовано з Wix.`
4. Перевірити БД:

```txt
approvalStatus = APPROVED
wixSyncStatus = SYNCED
wixSubmissionId != null
wixSyncedAt != null
wixSyncError = null
```

5. Перевірити новий response у Wix Dashboard.
6. Перевірити badge `Synced with Wix` у колонці `Wix Sync`.

## 3. Failed Wix Sync Scenario

Передумова: окремий QA therapist має `approvalStatus = PENDING_REVIEW`.

1. Тимчасово встановити invalid `WIX_API_TOKEN` у локальних secrets або
   використати контрольовану provider failure конфігурацію.
2. Погодити QA therapist в admin UI.
3. Перевірити, що UI показує partial failure:
   `Терапевта погоджено, але не вдалося синхронізувати з Wix. Спробуйте повторити синхронізацію.`
4. Перевірити БД:

```txt
approvalStatus = APPROVED
isApproved = true
wixSyncStatus = FAILED
wixSyncedAt = null
wixSyncError != null
```

5. Перевірити badge `Sync failed` і кнопку `Retry sync to Wix`.
6. Відновити коректну Wix configuration до retry scenario.

## 4. Retry Scenario

Передумова: QA therapist має `approvalStatus = APPROVED` і
`wixSyncStatus = FAILED`, а Wix configuration виправлена.

1. У колонці `Wix Sync` натиснути `Retry sync to Wix`.
2. Перевірити success message:
   `Терапевта успішно синхронізовано з Wix.`
3. Перевірити БД:

```txt
wixSyncStatus = SYNCED
wixSubmissionId != null
wixSyncedAt != null
wixSyncError = null
```

4. Перевірити response у Wix Dashboard.
5. Перевірити badge `Synced with Wix` у UI.

## Критерій завершення

Manual QA буде повністю завершена лише після live виконання:

- одного approve success scenario;
- одного approve partial-failure scenario;
- retry для failed profile після відновлення Wix configuration.

Ці кроки потребують дозволу на створення тестових даних у віддаленій БД та
нових responses у Wix Dashboard.
