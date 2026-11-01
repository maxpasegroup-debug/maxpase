# Private employee documents

The employee Documents view is under `/app/boss/departments/hr/employees/[employmentId]`. It uses the existing Person and Employment records. Each `HrDocument` belongs to one employment and legal company, with an optional verified Brand. Brand uploads require an active assignment for that employment. A brand assignment does not itself grant document access.

Document files are uploaded by the server to Cloudinary with delivery type `authenticated` and a new random public ID for each version. The browser never receives Cloudinary credentials or a persistent asset URL. Open and Download use the MAXPASE route, which checks access, retrieves the asset by immutable Cloudinary asset ID using a short-lived signed request, records successful access and returns a no-store response. PDFs and images are limited to 10 MB and checked against their file signatures. The original asset is retained when a document is replaced or archived. Failed uploads remain visible as `FAILED`; a successful replacement changes the old version to `REPLACED` only after the new asset is stored.

Document metadata, lifecycle, ownership, uploader and version links live in PostgreSQL. Operational events and audit records preserve upload, replacement, archival, failure and successful-access history. Default categories are shared across companies. Group HR can create additional company categories; no company-specific category list is assumed.

## Configuration

Set these variables privately on the MAXPASE application service, never in source or browser configuration:

- `CLOUDINARY_CLOUD_NAME`: the Cloudinary product environment name.
- `CLOUDINARY_API_KEY`: the API key for server-side upload and signed download.
- `CLOUDINARY_API_SECRET`: the matching API secret.

Use the Cloudinary account's API Keys settings to obtain the values. Do not paste them in chat or commit them. Without all three variables, upload and download fail closed and the profile shows that storage is not configured. The additive PostgreSQL migration `20261101000000_hr_documents` must be applied after the earlier HR employment migration before serving the new document routes. No production migration or provider call was made in this development pass.

Company HR access requires explicit `hr.document.read` or `hr.document.manage` permission at the company. Brand HR access requires an existing active division Organization with the same verified slug as that Brand and an explicit permission at that division. Unmapped sub-brands remain restricted to authorized company/group HR. The Boss path also requires existing Boss authority and Person permission. New document permissions are registered, not automatically granted by job title.

Retention periods, legal document policy, permitted administrators, malware scanning and any requirement for employee self-access need written owner decisions before production rollout. The authenticated asset flow and storage account settings should be exercised with an isolated test account before live HR documents are uploaded.

Cloudinary reference: [authenticated media](https://cloudinary.com/documentation/control_access_to_media), [Upload API](https://cloudinary.com/documentation/image_upload_api_reference).
