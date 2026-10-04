import csv
from collections import Counter

rows = []

def add(domain, status, note, category="", submit_url="", date="2026-10-01"):
    rows.append({
        "domain": domain,
        "url": f"https://{domain}/",
        "submit_url": submit_url,
        "category": category,
        "http": "",
        "status": status,
        "submitted": "yes" if status == "submitted" else "no",
        "date": date,
        "notes": note,
    })

# --- Confirmed submissions Oct 1-2 2026 (joinrcmp campaign) ---
submitted = {
    "somuch.com": "submitted + email verified (ID 3956004)",
    "jayde.com": "confirmed via thank-you page",
    "gainweb.org": "awaiting approval; Education > Job & Employment",
    "9sites.net": "editor review; Education > Career & Vocational",
    "sonicrun.com": "email verified; listing live in ~30 days",
    "infotiger.com": "queued, no confirmation shown (crawl submission)",
    "01webdirectory.com": "editor validation; HR > Career Counseling",
    "247webdirectory.com": "pending review; Education > Career",
    "cipinet.com": "review queue; Business",
    "txtlinks.com": "editor review; Education",
    "freeprwebdirectory.com": "awaiting approval",
    "submissionwebdirectory.com": "awaiting approval",
    "highrankdirectory.com": "awaiting approval",
    "hitwebdirectory.com": "awaiting approval",
    "prolinkdirectory.com": "pending review; Careers > Education & Careers",
    "directory-free.com": "editor validation; Society > Education",
    "adbritedirectory.com": "awaiting approval",
    "allstatesusadirectory.com": "awaiting approval",
    "arcticdirectory.com": "accepted; Career & Vocational",
    "australiawebdirectory.net": "awaiting approval",
    "backpagedir.com": "accepted; Education",
    "bedirectory.com": "accepted",
    "bizz-directory.com": "accepted; Employment",
    "blackandbluedirectory.com": "awaiting approval; Employment",
    "ecobluedirectory.com": "awaiting approval; Employment",
    "expansiondirectory.com": "submitted via manual captcha click",
    "directory10.org": "accepted",
    "direct-directory.com": "awaiting approval; Employment",
    "directdirectory.org": "accepted; no category field",
    "viesearch.com": "already in review queue before campaign",
}
for d, n in submitted.items():
    add(d, "submitted", n)

# --- Waiting on one human captcha click ---
add("fruity-directory.com", "captcha-human", "form pre-filled, needs human captcha click")
add("dbsdirectory.com", "captcha-human", "one human click away")
add("directory3.org", "captcha-human", "one human click away")
add("advancedseodirectory.com", "captcha-human", "reCAPTCHA ignores automated clicks")
add("afunnydir.com", "captcha-human", "image challenge appears")
add("alive-directory.com", "captcha-human", "image challenge appears")
add("greenydirectory.com", "captcha-hostile", "captcha fails even for human click - broken")
add("exactseek.com", "blocked-manual", "Cloudflare strips automated form posts; 30-sec manual job")
add("cleangreendirectory.com", "retry-later", "server overloaded (508) at time of run")
add("alivelink.org", "broken-norm", "captcha solved but submit button does nothing (dead handler)")

# --- Dead / rotted ---
add("1abc.org", "dead-parked", "domain expired, parked at GoDaddy")
add("a1webdirectory.org", "dead-hijacked", "serves gambling spam")
add("acewebdirectory.com", "dead-parked", "domain parked")
add("domaining.in", "dead-forsale", "domain for sale")
add("searchsight.com", "dead-forsale", "domain for sale on GoDaddy")
add("directory5.org", "dead-suspended", "hosting account suspended")
add("digabusiness.com", "dead-blank", "blank page on submit")
add("w3catalog.com", "dead-pivoted", "no longer a directory - review articles now")

# --- Server-side software bugs ---
add("amray.com", "broken-sql", "free-submit script throws SQL error")
add("athenelinks.com", "broken-sql", "MySQL error - IP column too short")
add("caida.eu", "broken-sql", "server save error, same network bug as Athenelinks")
add("bing-directory.com", "broken-sql", "SQL error - LINK_TYPE column gets no value")
add("admyurl.com", "broken-blank", "submit returns blank page (handler dead)")
add("000directory.com.ar", "no-form", "submit page renders no form")
add("abc-directory.com", "no-form", "submit page never shows its form")

# --- Broken forms / wizards ---
add("a2place.com", "broken-wizard", "submit wizard stuck at step 1")
add("abstractdirectory.net", "no-form", "submit form missing entirely")
add("activdirectory.net", "broken-wizard", "stuck wizard template")
add("aweblist.org", "broken-wizard", "stuck wizard template")
add("businessfreedirectory.com", "broken-wizard", "3-step wizard hung on final submit")
add("directory6.org", "broken-wizard", "stuck wizard template")
add("tsection.com", "broken-redirect", "redirect loop on submit page")
add("pegasusdirectory.com", "broken-host", "add-listing page dead (host error)")
add("bpdir.com", "no-form", "free tier advertised but no form exists")
add("alivelinks.org", "broken-hang", "page hangs the browser")
add("classdirectory.org", "broken-wizard", "unconfigured install + captcha-walled (low value)")

# --- Paid-gated ---
paid = {
    "ayroo.com": "takes listing then demands payment",
    "businessseek.biz": "free submission retired - $20/yr sponsored only",
    "corpdirectory.info": "both tiers route to payment page; reciprocal also required",
    "directoryvault.com": "all plans paid and auto-renewing",
    "alistdirectory.com": "claim-based paid plans (DirectoryVault network)",
    "weboworld.com": "only plan is $10 featured; account was created+verified first",
    "worldsiteindex.com": "submission routes to PayPal",
}
for d, n in paid.items():
    add(d, "paid-gated", n)

# --- Needs user data ---
add("daduru.com", "needs-nap", "requires business phone, address, hours (NAP)")
add("skaffe.com", "weekend-window", "free submissions only Fri 6pm - Mon 6am EDT")
add("activesearchresults.com", "needs-activation", "account exists, needs password reset")
add("netinsert.com", "needs-meta", "requires pasting one meta tag into site HTML")

# --- Remaining queue (83) ---
queue = """best-financial-directory.com businessconnect.directory canadiandirectory.org
canopusdirectory.com directorycar.com directorysitesubmit.com dirhello.com
domainnamesseo.com dracodirectory.com ellysdirectory.com excitedirectory.com
familydir.com fashionlistings.org finest4.com fire-directory.com
flamingodirectory.com free-weblink.com freedirectory-listings.org
freeinternetwebdirectory.com freeseolink.org freetoprankdirectory.com
freewebsubmission.com gmawebdirectory.com golddirectory.info h-log.com
harddirectory.info hotdirectory.net huludirectory.com idahoindex.com
indusdirectory.com intercambioseo.com justdirectory.org justlink.org
latesttopdirectory.org legacydirectory.com lemon-directory.com linkcentre.com
linkdir4u.com linkdirectorylistings.org livewebmarks.com lushdirectory.com
marketinginternetdirectory.com marketingwebdirectory.com moderntopdirectory.org
nctweb.com one-sublime-directory.com onemilliondirectory.com orcca.org
postfreedirectory.com promotebusinessdirectory.com qualityinternetdirectory.com
quickdirectory.biz quicklinks.net searchdirectory.info searchdomainhere.com
seooptimizationdirectory.com seotarget.net seowebdir.net
sitepromotiondirectory.com sites-plus.com siteswebdirectory.com
sizzlingdirectory.com smartseobacklink.com smartseolink.org sublimedir.net
submit.biz submitindustry.com taurusdirectory.com theseobacklink.com
trafficdirectory.org ukinternetdirectory.net uklinks.info unique-listing.com
universaldirectory.info upsdirectory.com webglance.com websquash.com
welcomelinks.info workdirectory.info yellowlinker.com""".split()
for d in queue:
    add(d, "ok", "queued from Oct 2026 campaign; submit URL not yet verified", date="2026-10-02")

with open("directories.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=["domain", "url", "submit_url", "category", "http", "status", "submitted", "date", "notes"])
    w.writeheader()
    w.writerows(rows)

c = Counter(r["status"] for r in rows)
print(len(rows), "rows")
for k, v in c.most_common():
    print(f"  {k}: {v}")
