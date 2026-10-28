# Group brand hierarchy

The Boss registry records companies and brands with stable IDs. `Brand.parentBrandId` stores a sub-brand's parent within the same company. The Boss tree and company/brand pages read these relationships; display names do not establish ownership.

| Company | Parent brands | Sub-brands |
| --- | --- | --- |
| AIRA SKILL CITY PRIVATE LIMITED | AIRA SKILL CITY; AIRA STARTUP SKOOL; AIRA LABS; AIRA CAREER HUB | AIRA LABS: MY SOLAR SOLUTIONS, NTE NAADU, HAPPINOTES, TALKIN LABS, BGOS. AIRA CAREER HUB: NICEJOBS. |
| TEARN PRIVATE LIMITED | TEACHX GURU; LEARNX GURU | None recorded. |
| TOP RANK AI PRIVATE LIMITED | TOP TANK AI | None recorded. |

The last brand label follows the owner's exact instruction. The company's legal name remains TOP RANK AI PRIVATE LIMITED. Existing brand slugs and IDs are retained, including `top-rank-ai`, `startup-school`, and `nice-jobs`. Operational divisions and products remain separate records. BGOS and Nice Jobs product links move to their corresponding sub-brand records; this does not publish either product. New sub-brand records are initialized as inactive until separately reviewed. Recorded domains are not evidence of domain routing or certificate verification.

The additive PostgreSQL migration must run before this code is deployed. Initialization is an explicit, audited operator step and is not called by page reads. Apply it only through the reviewed release procedure after a verified backup. The current change has not run against production.
