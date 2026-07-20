# Research: Legal Landscape for "Mvoe" — Peer-to-Peer Free Food App (US Law)
Date: 2026-07-19

**This is research for planning purposes only. It is not legal advice. Nothing here should be treated as a substitute for consulting a licensed attorney and the relevant local health department before launch.**

## Executive Summary

The Bill Emerson Good Samaritan Food Donation Act (42 U.S.C. § 1791) protects "persons" (which the statute defines broadly enough to include individuals) who donate "apparently wholesome food" or "apparently fit grocery products" in good faith — but historically only when the donation flowed through a nonprofit for ultimate distribution to the needy. The 2023 Food Donation Improvement Act (FDIA) closed part of that gap by extending federal liability protection to direct donations from "qualified direct donors" straight to needy individuals or groups — but "qualified direct donor" is a defined list of business/institutional entities (retail grocers, wholesalers, agricultural producers, restaurants, caterers, schools, etc.), and it is genuinely unclear whether an ordinary private individual donor qualifies. The Act never mentions or protects a platform/app operator at all — Mvoe itself gets zero liability shield from this statute. The Act also explicitly does not preempt state and local health codes, so California/Santa Clara County rules layer on top. Community fridges and Little Free Pantries operate in a real legal gray zone that has produced actual shutdowns (Los Angeles, Long Beach, Compton) over permitting, right-of-way, and food-handling citations. Existing peer-to-peer sharing organizations (Little Free Pantry, Freedge, Buy Nothing Project, Olio) all lean on the same combination of self-risk disclaimers, "don't post home-cooked/perishable food" style rules, and "we are not liable" platform disclaimers — none of them claim the Good Samaritan Act protects the platform, and several explicitly warn users that legal protection is not guaranteed.

## 1. The Bill Emerson Good Samaritan Food Donation Act (42 U.S.C. § 1791)

### What it protects, and whom

The statute has two liability-shield provisions:

- **§1791(c)(1) — Donor/gleaner protection:** "A person or gleaner shall not be subject to civil or criminal liability arising from the nature, age, packaging, or condition of apparently wholesome food or an apparently fit grocery product that the person or gleaner donates in good faith to a nonprofit organization for ultimate distribution to needy individuals."
- **§1791(c)(2) — Nonprofit-recipient protection:** A nonprofit organization that receives such a donation in good faith is likewise shielded.

Key definitions (§1791(b)):
- **"Person"** is defined broadly — "an individual, corporation, partnership, organization, association, or governmental entity" — so on its face an ordinary private individual is a "person" for purposes of the Act. ([Cornell LII, 42 U.S.C. §1791](https://www.law.cornell.edu/uscode/text/42/1791))
- **"Gleaner"** — someone who harvests a donated agricultural crop for free distribution to the needy or to a nonprofit.
- **"Apparently wholesome food"** / **"apparently fit grocery product"** — food/product that meets all federal, state, and local quality and labeling standards, even if not "readily marketable" due to appearance, age, freshness, size, or surplus.
- **"Nonprofit organization"** — an incorporated or unincorporated entity operating for religious, charitable, or educational purposes with no private inurement.

### Critical gap in the original Act: it required a nonprofit intermediary

Before 2023, the statute's text protected donations made **to a nonprofit organization for ultimate distribution** — it did not, on its face, protect a private individual handing food directly to another private individual (peer-to-peer), because there was no nonprofit in the chain. This is exactly the structure of Mvoe: individual posts food, stranger takes it, no nonprofit anywhere.

### The 2023 Food Donation Improvement Act (FDIA) — what changed

Signed January 5, 2023, the FDIA amended §1791 to:

1. **Add "qualified direct donors" as protected donors who may give directly to needy individuals/groups**, not only through a nonprofit. A "qualified direct donor" is a defined, closed list: retail grocers, wholesalers, agricultural producers, restaurants, caterers, and schools/institutions of higher education (i.e., commercial/institutional food businesses already subject to food-safety regulation) — see the definition summarized by [CHLPI](https://chlpi.org/news-and-events/news-and-commentary/food-law-and-policy/food-donation-improvement-act-signed-into-law/) and [Food Rescue Hero](https://foodrescuehero.org/the-bill-emerson-good-samaritan-food-donation-act/).
2. **Extend protection to donations sold at a "good Samaritan reduced price"** — a price no greater than the cost of handling/harvesting/processing/packaging/transporting/distributing the food — where previously only $0 donations were covered.

**This is the crux of the legal ambiguity for Mvoe:** the FDIA's "direct donation" fix was explicitly built for *businesses* (a restaurant giving surplus food straight to a shelter or individual, cutting out the nonprofit middleman), not for a private citizen giving away home food. Nothing in the FDIA or its legislative history that we found extends "qualified direct donor" status to an ordinary consumer. So an individual Mvoe user donating food directly to a stranger arguably still falls into a definitional gap: they are a "person" under the original 1996 language, but that language's protection is conditioned on donating "to a nonprofit organization for ultimate distribution" — and they are not a "qualified direct donor" under the 2023 amendment because that term is limited to commercial/institutional donors. There does not appear to be settled case law or agency guidance resolving whether an individual-to-individual direct donation is covered. **Flag: this is a genuinely unsettled question, not merely a matter of us not finding the answer.** Treat it as unresolved when advising the developer.

### Liability standard and conditions

- **Standard:** No civil or criminal liability, **except** for harm caused by the donor's **gross negligence or intentional misconduct** (§1791(f)). Ordinary negligence is shielded; gross negligence/intentional misconduct is not.
- **Conditions:** the food must be "apparently wholesome"/"apparently fit," meeting all quality/labeling standards; the donation must be made "in good faith."
- **No preemption of state/local law:** §1791 explicitly states nothing in the section "supercede[s]" state or local health regulations. Federal liability protection (even if it applied) does nothing to exempt anyone from a local health code violation. ([Cornell LII](https://www.law.cornell.edu/uscode/text/42/1791))

## 2. The Gap — What Is NOT Protected

Being explicit and honest about exposure for Mvoe:

1. **Home-cooked / prepared food:** The Act's protection is keyed to "apparently wholesome food" meeting quality/labeling standards. Home-cooked meals generally have no label, no ingredient/allergen disclosure, and were not prepared in an inspected facility — so it is doubtful they qualify as "apparently wholesome" in the sense courts or regulators would expect, and separately, home-cooked food shared for free from a private kitchen is exactly the kind of thing state/local "cottage food" and food-facility rules regulate (see Section 3). Freedge's own guidance for community fridges says **"homemade foods are not allowed"** in most of their state legal guides, and all cooked food must come from a licensed/registered kitchen with a food-safety certificate. ([Freedge](https://freedge.org/freedge-yourself/legal/))
2. **Temperature-controlled / potentially-hazardous foods:** Nothing in the Emerson Act deals with temperature abuse, and it is a leading cause of real liability exposure (foodborne illness from food left unrefrigerated). A pin marked "free food here" with no temperature control is a foreseeable risk vector.
3. **Allergens:** No labeling requirement is enforced by an individual donor; undisclosed allergens (peanuts, shellfish, gluten) are a classic source of real injury and litigation risk that the Act does not specifically immunize against if a court found the conduct "grossly negligent" (e.g., a known allergen deliberately not disclosed).
4. **Food that is sold, not given away:** The Act (even after FDIA) only protects donations at $0 or at a defined "good Samaritan reduced price" tied to handling costs. If Mvoe ever allows any exchange of money (even a "suggested donation" that functions as payment), that transaction likely falls outside the Act entirely, and outside "free food" framing generally, triggering full food-facility/retail-sale regulation.
5. **The platform/app operator gets nothing from this Act.** The statute protects "persons," "gleaners," "nonprofit organizations," and "qualified direct donors" who are the ones handling/donating the food. Mvoe as a company is none of these — it never possesses or donates food; it operates a map/posting service. There is no provision anywhere in §1791 that shields a platform operator, and no indication any court has extended it that way. **Mvoe's own liability shield, if any, will have to come from other law** — most likely Section 230 of the Communications Decency Act (47 U.S.C. §230) to the extent claims are premised on third-party user content/posts, plus a well-drafted Terms of Service, disclaimers, and possibly general negligence/premises-liability defenses — not from the Good Samaritan Act. This is worth flagging clearly to the developer: **the Good Samaritan Act protects individual donors, not Mvoe as a company.**
6. **State Good Samaritan variants differ.** Many states have their own food-donation liability statutes that may be broader or narrower than the federal Act (some explicitly cover individual-to-individual donations, some don't). California's own statute should be checked separately (see below) — federal law is a floor, not the whole picture.

## 3. State/Local Layer — California, Santa Clara County, and Bay Area Community Fridges

### California's Retail Food Code

- **Cal. Health & Safety Code §113789** defines **"food facility"** very broadly: "an operation that stores, prepares, packages, serves, vends, or otherwise provides food for human consumption at the retail level ... **regardless of whether there is a charge for the food**." That "regardless of whether there is a charge" clause is important — under a literal reading, giving food away doesn't automatically exempt an "operation" from being a regulated food facility. ([FindLaw](https://codes.findlaw.com/ca/health-and-safety-code/hsc-sect-113789/), [Justia](https://law.justia.com/codes/california/code-hsc/division-104/part-7/chapter-2/section-113789/))
- **Exclusions from "food facility"** include: private homes used for private, noncommercial purposes (or as a registered/permitted Cottage Food Operation), and churches/private clubs/nonprofit associations giving/selling food only to members/guests at events occurring ≤3 days per 90-day period.
- The word "operation" is doing a lot of work here. A single private individual placing a one-time bag of shelf-stable food at a map pin is much more analogous to the "private home, noncommercial" exclusion or to a one-off gift than to an "operation." But an *organized, standing* community fridge or pantry location — especially one with recurring restocking, signage, and a fixed site — starts to look more like an "operation," which is precisely why community fridges have drawn health-department attention (below). **Mvoe's app-mediated, repeatable, location-based structure sits closer to that "operation" characterization than a one-off individual gift does**, and that is a meaningful distinction from, e.g., a single Buy Nothing post.
- **Cottage Food Operations (AB-1616)** let a permitted/registered private-home kitchen sell certain non-potentially-hazardous foods from an "Approved Foods List," but require registration, training, and adherence to that list — this pathway is for **sale**, is registration-gated, and doesn't map cleanly onto free P2P giving of arbitrary homemade food. ([CDPH](https://www.cdph.ca.gov/Programs/CEH/DFDCS/Pages/FDBPrograms/FoodSafetyProgram/CottageFoodOperations.aspx))

### Santa Clara County (Bay Area) mechanism for charitable food distribution

Santa Clara County's Department of Environmental Health / Consumer Protection Division has a specific regulatory category: the **Limited Service Charitable Feeding Operation (LSCFO)** — defined as **a nonprofit charitable organization** that provides food service solely for charity, limited to storage/distribution of **whole, uncut produce** or **prepackaged, non-potentially-hazardous food in original manufacturer packaging**. LSCFOs can register for (or in some cases be exempt from) a permit **in lieu of** a full food-facility permit, if they follow county-approved best management practices. ([County of Santa Clara — Limited Service Charitable Feeding Operation](https://cpd.sccgov.org/programs-and-services/limited-service-charitable-feeding-operation))

This is telling for Mvoe in two ways:
- It confirms the county's baseline assumption is that **charitable food distribution is regulated activity** unless it fits a narrow carve-out (whole produce, or factory-sealed non-hazardous packaged goods only) **and** is run by a **nonprofit organization** that registers.
- A community fridge or pantry stocked with **home-cooked meals, cut produce, or anything potentially hazardous is outside the LSCFO carve-out** and would need a full food-facility permit to be unambiguously compliant — which essentially no private individual poster on Mvoe will have.
- Critically, the LSCFO pathway is built around an organized **nonprofit**, not an ad hoc individual — reinforcing that Mvoe, as a platform enabling one-off individual postings, doesn't have an obvious regulatory lane at all under existing county categories. It's neither a private noncommercial home donation (arguably, if truly one-off) nor a registered charitable feeding operation.
- Santa Clara County also separately regulates **Temporary Food Facility (TFF) permits** for events where food is "sampled, sold, prepared, or given away," further signaling the county's default posture is that giving away food publicly is a permit-triggering activity outside narrow exemptions.

### What community fridges actually do, and real shutdowns

Community fridges nationwide (including LA-area ones) generally do **not** obtain food-facility permits; they operate on a theory that they're closer to gleaning/gifting than a "food facility," post visible ground rules, self-police via volunteers, and hope for tolerance from health departments (inspection is usually complaint-driven, not proactive). Freedge explicitly tells hosts: **"Have your sharing rules visible to all users so local health authorities can see the freedge is well managed"** and frames formal permitting as not a prerequisite to starting. ([Freedge Legal Guides](https://freedge.org/freedge-yourself/legal/))

That tolerance is not guaranteed, and real shutdowns have happened:
- **Highland Park (LA), Long Beach, and Compton fridges were shut down in 2020.** Highland Park's was cited by LA City Public Works for "obstruction of public right of way." Long Beach's was shut down on-site by the Dept. of Health and Human Services over **unlicensed distribution of food and absence of a permit**, following a complaint. Compton's received property-maintenance and electrical-code notices. ([Los Angeleno](https://www.losangelen.com/features/community-fridges-shut-down/), [LAist](https://laist.com/news/officials-not-chill-about-community-fridges-los-angeles))
- Coverage repeatedly describes this space as **"a legal gray area"** where citations and health codes "have sometimes hindered" the mutual-aid model, even though enforcement is inconsistent and often complaint-triggered rather than systematic. ([L.A. TACO](https://lataco.com/community-fridges-la-free-food), [Distractify](https://www.distractify.com/p/community-fridges))

**Bottom line for the Bay Area:** there is no case we found of a Santa Clara County or SF Bay Area community fridge being shut down specifically, but the LA-area precedent (right-of-way, unpermitted food distribution, property/building code) shows the realistic enforcement vectors are (a) public-right-of-way / zoning complaints about the physical site, not the food itself, and (b) "operating without a permit" citations if a complaint is filed — usually neighbor- or competitor-triggered, not proactive sweeps.

## 4. Precedent — How Existing Organizations Handle This

| Organization | Model | Liability approach |
|---|---|---|
| **Little Free Pantry** | Physical box network, informal stewards | Cites the Good Samaritan Act but explicitly warns stewards that **"establishing or donating to an affiliated Little Free Pantry project is not a guarantee of protection from liability under this law."** Recommends an on-site disclaimer, notes most stewards carry no special insurance (rely on homeowner's policy "other structures" coverage), and tells stewards with concerns to **"consult an attorney."** ([littlefreepantry.org/about-liability](https://www.littlefreepantry.org/about-liability)) |
| **Freedge** | Community fridge network | Leans on the Good Samaritan Act plus state-specific legal guides; explicitly instructs hosts that **home-cooked food is generally not allowed**, only produce/shelf-stable/sealed packaged goods or food from a licensed kitchen with a safety certificate; requires visible posted rules; offers a host liability agreement and fiscal sponsorship. Frames lawsuits as "extremely uncommon" but doesn't claim zero risk. ([freedge.org/freedge-yourself/legal](https://freedge.org/freedge-yourself/legal/)) |
| **Buy Nothing Project** | Hyperlocal Facebook/app gift groups (food is one category among many) | Core rule: gifts given "freely without expectation of reward"; no selling/bartering. Explicit platform disclaimer: **"participants are encouraged to participate at their own risk, and the Buy Nothing Project, founders, community leaders, and group admins accept no responsibility or legal liability for any loss, damage, illness, or injury arising out of group activities."** ([buynothingproject.org/guidelines](https://buynothingproject.org/guidelines)) |
| **Olio** | App-mediated P2P sharing incl. home-cooked food | Explicitly **permits home-cooked food** (raw or cooked, sealed or open, but never past use-by date). Strong platform disclaimer disclaiming liability for disputes/losses "arising out of or in connection with" receiving items from another user (an "Adder"), and caps any platform liability (~£100) even for its own breaches. Publishes a "food safety" hub and rules that impose point-based penalties/bans on hosts ("Food Waste Heroes") for safety violations. ([olioapp.com/en/terms-and-conditions](https://olioapp.com/en/terms-and-conditions/), [help.olioapp.com — guidelines for sharing](https://help.olioapp.com/article/68-guidelines-for-sharing)) |

**Common pattern across all four:** (1) a plain-language "you take this at your own risk" disclaimer aimed at users, (2) an explicit, sweeping platform-liability disclaimer, (3) food-type restrictions (Freedge bans home-cooked; Olio allows it but with rules and enforcement; Little Free Pantry is silent on food type but implicitly assumes shelf-stable pantry goods), and (4) an instruction to consult a lawyer for anything beyond generic guidance. None of them represent to users that the Good Samaritan Act protects the *platform* — only, at most, that it may protect the *donor*, and even that is hedged.

## 5. Practical Deliverables

### (a) Draft in-app safety/liability notice (shown when a user posts food)

> **Before you post: read this.**
> Mvoe is a map — a place for neighbors to tell each other "there's free food here." Mvoe does not inspect, handle, store, or verify any food posted through the app, and is not a party to the exchange between you and whoever takes it.
>
> By posting, you confirm the food is genuinely intended as a free gift (no payment, no barter), that you believe it is safe to eat, and that you'll disclose anything a reasonable person would want to know (what it is, when it was made/opened, and any common allergens like nuts, dairy, gluten, or shellfish).
>
> By taking food through Mvoe, you understand it comes from another private individual, not a licensed food business — it has not been inspected. Use your own judgment: check freshness, ask about ingredients, and when in doubt, don't eat it.
>
> Mvoe, its operators, and other users are not responsible for illness, injury, or loss connected to food posted or taken through the app. Some legal protections exist for people who donate food in good faith, but those protections are limited and don't cover reckless conduct — don't post food you know or suspect is unsafe.
>
> *This notice is general information, not legal advice, and posting or taking food through Mvoe is always at your own risk.*

*(Have an attorney review and localize this before shipping — especially the liability-waiver language, which has state-specific enforceability rules.)*

### (b) Food types to tell users NOT to post

Based on Freedge's and Olio's real-world rulesets and the Good Samaritan Act's gaps:
- Home-cooked or home-prepared hot/cold meals requiring refrigeration or reheating (highest risk: temperature abuse + no labeling + not from an inspected kitchen)
- Anything requiring refrigeration that hasn't been continuously refrigerated (dairy, meat, eggs, cut produce, leftovers)
- Cut or peeled produce (only whole, uncut produce should be encouraged — matches the Santa Clara County LSCFO carve-out)
- Food in non-original, unlabeled, or already-opened packaging (no ingredient/allergen info)
- Anything past its "use by" date (best-by/sell-by is more debatable, but use-by is a hard line)
- Home-canned or home-preserved goods (botulism risk — commercially canned only)
- Baby formula/food, raw milk, raw/undercooked meat or seafood, and alcohol
- Anything the poster wouldn't feel comfortable eating themselves after 4+ hours unrefrigerated

### (c) Questions the developer should bring to a local health department and to an attorney

1. **To Santa Clara County DEH/Consumer Protection Division:** Does an individual posting a one-time bag of shelf-stable food at a location via a mobile app count as a "food facility" under H&S Code §113789, or is it treated like a private, noncommercial gift? Does the answer change if the same physical location is used repeatedly by different app users (i.e., does the *app* make it look more like an "operation")?
2. **To the same county office:** Would a standing, app-coordinated "always has free food" location need to register as a Limited Service Charitable Feeding Operation, and can an individual (not a nonprofit) register as one — or does Mvoe/the app operator need to be the registrant?
3. **To an attorney (products liability / tort):** Does an ordinary individual using Mvoe to give food directly to a stranger qualify as a "person" protected by 42 U.S.C. §1791(c)(1), given that provision's text ties protection to donating "to a nonprofit organization for ultimate distribution" — or does the 2023 FDIA's "qualified direct donor" language, which is limited to commercial/institutional donors, imply Congress did *not* intend to cover individual-to-individual gifts, leaving that scenario unprotected by federal law?
4. **To an attorney (tech/platform liability):** To what extent does Section 230 of the Communications Decency Act shield Mvoe (the platform) from liability for harm caused by food described in user-generated posts, versus harm arising from Mvoe's own app design (e.g., if the app's own copy/prompts encourage posting unsafe food types)? What Terms of Service and liability-waiver language would actually hold up in California given the state's limits on enforcing liability waivers for gross negligence or against public policy?
5. **To an attorney (state law):** Does California have its own Good Samaritan food-donation statute distinct from the federal Emerson Act, and if so, does it cover individual-to-individual donations more clearly than federal law does? (Several states extend broader protection than the federal floor — this should be checked directly rather than assumed.)

## Sources

- [42 U.S.C. § 1791 — Bill Emerson Good Samaritan Food Donation Act (Cornell LII)](https://www.law.cornell.edu/uscode/text/42/1791)
- [Food Donation Improvement Act Signed into Law — CHLPI](https://chlpi.org/news-and-events/news-and-commentary/food-law-and-policy/food-donation-improvement-act-signed-into-law/)
- [The Bill Emerson Good Samaritan Food Donation Act — Food Rescue Hero](https://foodrescuehero.org/the-bill-emerson-good-samaritan-food-donation-act/)
- [Federal Food Donation Liability Protections — Zero Food Waste Coalition](https://zerofoodwastecoalition.org/federal-food-donation-liability-protections/)
- [City Fights Community Effort to Provide Free Fridges — Distractify](https://www.distractify.com/p/community-fridges)
- [Why Were 3 Community Fridges Shut Down? — Los Angeleno](https://www.losangelen.com/features/community-fridges-shut-down/)
- [Officials Are Not Chill About The Community Fridges Popping Up Around LA — LAist](https://laist.com/news/officials-not-chill-about-community-fridges-los-angeles)
- [What Happened to All Those Community Fridges That Popped Up In 2020 — L.A. TACO](https://lataco.com/community-fridges-la-free-food)
- [California Health and Safety Code § 113789 — FindLaw](https://codes.findlaw.com/ca/health-and-safety-code/hsc-sect-113789/)
- [California Health and Safety Code § 113789 — Justia](https://law.justia.com/codes/california/code-hsc/division-104/part-7/chapter-2/section-113789/)
- [Cottage Food Operations — California Dept. of Public Health](https://www.cdph.ca.gov/Programs/CEH/DFDCS/Pages/FDBPrograms/FoodSafetyProgram/CottageFoodOperations.aspx)
- [Limited Service Charitable Feeding Operation — County of Santa Clara](https://cpd.sccgov.org/programs-and-services/limited-service-charitable-feeding-operation)
- [Register for a charitable feeding program — Santa Clara County Environmental Health](https://deh.santaclaracounty.gov/food-and-retail/compliance-retail-food-operations/register-charitable-feeding-program)
- [Apply for a Temporary Food Facility Permit — Santa Clara County Environmental Health](https://deh.santaclaracounty.gov/apply-temporary-food-facility-permit)
- [About Liability — Little Free Pantry](https://www.littlefreepantry.org/about-liability)
- [Legal Guides — Freedge](https://freedge.org/freedge-yourself/legal/)
- [The Buy Nothing Project — Guidelines](https://buynothingproject.org/guidelines)
- [Olio — Terms & Conditions](https://olioapp.com/en/terms-and-conditions/)
- [Guidelines for sharing on Olio — Olio Help Center](https://help.olioapp.com/article/68-guidelines-for-sharing)

## Open Questions (genuinely unsettled — flagged, not answered)

- Whether an individual-to-individual food donation (no nonprofit, no "qualified direct donor" business) is covered by 42 U.S.C. §1791 at all after the 2023 FDIA amendment — we found no case law or agency guidance resolving this.
- Whether an app-coordinated, recurring "free food here" pin at a fixed location would be treated by Santa Clara County / CA courts as a "food facility operation" (per H&S §113789's broad "regardless of whether there is a charge" language) versus a private noncommercial gift — this likely depends on frequency, organization, and whether the app itself is seen as "operating" the site.
- Whether California has a standalone state-level Good Samaritan food donation statute broader than the federal Emerson Act (worth a dedicated follow-up search/attorney question — we did not find a definitive answer in this pass).
- Whether/how Section 230 would apply to protect Mvoe as a platform, versus claims framed around the app's own design choices (e.g., prompts, categories, or lack of warnings) rather than purely third-party content.
