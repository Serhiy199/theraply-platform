# Wix Card Bio Display

`TherapistProfile.bio` is a nullable Prisma string, not a rich-text JSON document.
Onboarding maps its textarea `therapyServicesProvided` into `bio`; string validation
does not prohibit legacy HTML. The existing Wix `bio` projection remains trimmed
source text in the existing RICH_TEXT field. Neither DB data nor readiness changes.

`formatWixBioDisplay` preserves trimmed plain text, including paragraph breaks.
For HTML it uses html-to-text (server-only), decodes entities, keeps paragraph and
line breaks, omits scripts/styles/images/embedded content and link destinations.
Missing or markup-only content converts to an empty string; the existing required
bio projection still rejects absent/blank source. No truncation or fallback bio is
invented. This plain text is for a Wix TEXT element, not an HTML insertion sink.

## Reproducible Additive Schema Step

The declaration and pure idempotent planner are in `src/lib/wix/wix-cms-schema.ts`:

```json
{
  "dataCollectionId": "Therapists",
  "field": { "key": "bioDisplay", "displayName": "Bio Display", "type": "TEXT" }
}
```

After verifying the target site's identity, GET its collection, pass the existing
fields to `planWixBioDisplayField`, and, only when separately authorized, send the
returned body to POST `/wix-data/v2/collections/create-field`. A null plan means no
schema write. A type conflict fails closed. Never replace the collection or edit
the existing `bio` field, permissions, indexes, dataset or repeater.

Verify all old field definitions unchanged and `bioDisplay: TEXT` present. Apply
this to staging first. Production schema changes require separate approval, before
running the newly deployed production reconciliation preflight, which requires the
new field. No startup or automatic schema mutation is introduced.

## Reconciliation Acceptance

Use canonical readiness and `mapTherapistToWixCmsItem` to compare existing items.
Only reconcile approved eligible identities whose only pending change is
`bioDisplay`. Stop for unexpected field drift rather than overwriting it.
Use `reconcileTherapistPublicProfile` without creating synthetic DB fixtures.
Read items back, compare every original public field, and verify the next read-only
projection comparison is NO_CHANGE. Empty eligible inventory cannot prove a live
UPDATE; report that limitation, do not alter readiness to manufacture evidence.

Wix reference: https://dev.wix.com/docs/rest/business-solutions/cms/data-collections/update-data-collection-field
