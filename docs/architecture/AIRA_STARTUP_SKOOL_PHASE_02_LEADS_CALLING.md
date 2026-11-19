# AIRA Startup Skool — Phase 2 Leads & Calling

## Workspace

- Employee portal: `/sites/skillcity/gateway?view=startup-leads`; on the AIRA Skill City portal host use `/gateway?view=startup-leads`.
- The Startup Skool AO sees the new Leads & Calling menu alongside the operations workspace. Authorized callers with the dedicated role land in their assigned lead workspace.

## Lead pipeline

Staff can create a pre-application prospect with name, phone, optional email, district/state, optional centre, source (website enquiry, event, referral, centre walk-in, approved campaign), campaign name, preferred PBA programme, and contact preference. An AO or Startup Skool Director can assign or reassign the lead to an active authorized Startup Skool caller. Callers see only leads currently assigned to them. Phone numbers are normalized for India when a ten-digit local number is provided; a unique hashed source key prevents duplicate lead creation within the Startup Skool division, including concurrent submissions.

## Manual contact activity

Callers record the contact method, outcome, note, server timestamp, and optional next callback. A callback-requested outcome requires a callback date. A `DO_NOT_CONTACT` status blocks further contact activity. The application does not place calls, send messages, or record audio. Application-started/submitted are lead statuses only; the actual application stays in the existing admissions system.

The AO pipeline can filter by caller, centre, district, and campaign, see due callbacks, and review activity counts by each dimension. These contacts and notes remain private to the Startup Skool lead permissions.

## Storage and authorization

Leads and contact activities reuse `ExecutiveRecord` and `ExecutiveHistory` with distinct Startup Skool record kinds. No migration is required. New scoped permissions are `startup.lead.read`, `startup.lead.create`, `startup.lead.call`, and `startup.lead.manage`. The role templates add these to the Startup Skool AO and Division Director, and add the least-privilege `Startup Skool Admissions Caller` role. Prepare the updated role templates and explicitly assign that role before caller access is available. Job titles do not grant permissions.

## Limits

This phase supports manually entered leads and call activity only. It does not include phone-provider integration, call recording, automated campaign imports, SMS/WhatsApp/email sending, or conversion that creates a submitted application. Lead centre/state/district are descriptive fields until the physical-centre registry is implemented.
