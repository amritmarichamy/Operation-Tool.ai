"""
Update the email field for all 71 candidates under Placement Officer 'Pallerla Asritha'
with their correct Job Email IDs (Gmail addresses).
"""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "crm.sqlite3")

# Mapping: Full Name -> Correct Job Email ID
EMAIL_UPDATES = {
    "Aparna Agrawal": "aparnaagrawal011@gmail.com",
    "nagadarshan": "darshanmannapur7@gmail.com",
    "Sai Akhil Gorti": "gortiakhil92@gmail.com",
    "Frieda Manjaly": "manjalyfrieda@gmail.com",
    "Gokul Vishnu": "gokulvishnu.contact@gmail.com",
    "Srujish Sreedharan": "srujish.s90@gmail.com",
    "Prabhsimar Singh": "prabhsimar0004@gmail.com",
    "Mohammed Numan S Jamadar": "Numan.europe09@gmail.com",
    "Pranav J Dev": "pranavjayadevandev@gmail.com",
    "Niharika": "niharikaashuklla@gmail.com",
    "Rushi Pise": "rushikeshsanjaypise@gmail.com",
    "Madani Jaseel Hussain": "jaseelbv2@gmail.com",
    "Nishant Chaudhary": "nishantmech.0001@gmail.com",
    "Dharmesh Joshi": "dharmeshjoshi.global@gmail.com",
    "Mohammed Kharoda": "mohammedkharoda9@gmail.com",
    "Monimozhi Balan Sundarabai": "Monimozhitt@gmail.com",
    "Nilofer Farhana": "niloferfarhana1985@gmail.com",
    "Joel Altrin J": "joel.altrin99@gmail.com",
    "Ashok.B.N": "ashokbn2371@gmail.com",
    "Ravishankar Mohan": "sharavi.mo@gmail.com",
    "Prakash M": "prakashmaniyarasan@gmail.com",
    "Yukeshkumar": "yukeshkumardharmalingam@gmail.com",
    "Vigneshkumar M": "vigneskumarmanikandan@gmail.com",
    "Poornesha": "hmpoornesha2512@gmail.com",
    "Yv Naveen Kumar": "yvnaveenkumar0907@gmail.com",
    "Sindhu": "sindhutanav99@gmail.com",
    "Sheshadri H": "sheshadri1102@gmail.com",
    "Harsha": "harshatt1234@gmail.com",
    "Christina": "christina.bommarthip@gmail.com",
    "Naveenkumar Rajavenkatesh": "naveenkumarr.techy@gmail.com",
    "Thalabady k": "thalabadykabalane999@gmail.com",
    "Aashish": "aashish.german.jobs@gmail.com",
    "POONACHA MB": "mbpoonacha0184@gmail.com",
    "CHANDAN JALIHAL": "jalihalchandan@gmail.com",
    "Sanket Mohapatra": "mohapatra.sanket732@gmail.com",
    "Durgadas Shhetty": "shhettydurgadas@gmail.com",
    "RaviTeja Gurugula": "raviteja.gurugula.it@gmail.com",
    "Sabish Raja": "sabishsuresh@gmail.com",
    "Devendran Muthusamy": "devendranmuthusamy26@gmail.com",
    "Nishanth BV": "nishanthbv08@gmail.com",
    "Nirupam Mondal": "Nirupam.mondal.me@gmail.com",
    "Lenin A": "leninalfred10@gmail.com",
    "Jayavel Ganesan": "Jayavel.uiuxdesigner@gmail.com",
    "Keerthi Prasad HG": "keerthiprasadhg087@gmail.com",
    "Karthik Prakash": "kp.pudota@gmail.com",
    "Ezhil Arasan": "ezhilarasanv1989@gmail.com",
    "Rechal Xavier": "rechalxavier2@gmail.com",
    "Kareem Sheik": "kareem.abroad@gmail.com",
    "Wyneth Keshav Gokul": "wynkgo@gmail.com",
    "Ayas Kanta Pattnaik": "ayas.596750@gmail.com",
    "Naushad Shaikh": "shaikhnaushadtaslim@gmail.com",
    "Vinoth Edward": "Vinothedward19@gmail.com",
    "Karthikeyan Dhanarajan": "mdkarthikeyan1818@gmail.com",
    "Athul Pavangat": "athul.pavangat24@gmail.com",
    "Sandeep": "sandip.ger27@gmail.com",
    "KIRAN SALIAN": "kirssssal@gmail.com",
    "Charles Herbert Matovu": "charleshmatovu@gmail.com",
    "Kavya Venkateshwaran": "kavyavenkateshwaran16@gmail.com",
    "Imran Sheikh": "imransheikhjob123@gmail.com",
    "Shivtaj Malik": "malikshivtaj14@gmail.com",
    "soumya prakash pradhan": "soumyaprakashp5@gmail.com",
    "Maroo Yash Oceans": "yashmaroo360@gmail.com",
    "Prabhaharan Nagarajan": "dialysistech001@gmail.com",
    "Manoj": "gb.manojprabhakar@gmail.com",
    "Afzal khan": "Afzalkhan95467@gmail.com",
    "Anurag Chaudhuri": "anuragchaudhuri2023@gmail.com",
    "Snehal": "globalsnehal.2222@gmail.com",
    "Sampada sawant": "sampada.sawant108@gmail.com",
    "Chaitrali": "chaitrali.borade01@gmail.com",
    "shweta": "shwetarana2118@gmail.com",
    "Dr.Paul Pandi": "dr.paulpandi@gmail.com",
}

def main():
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    # First, get all candidates under Pallerla Asritha
    c.execute("SELECT id, name, email FROM candidates WHERE placement_officer_member LIKE '%Asritha%'")
    candidates = c.fetchall()

    print(f"Found {len(candidates)} candidates under Pallerla Asritha\n")

    updated = 0
    not_found = []
    already_correct = 0
    errors = []

    for cand_id, cand_name, old_email in candidates:
        # Try exact match first
        new_email = EMAIL_UPDATES.get(cand_name)

        # If not found, try case-insensitive match
        if new_email is None:
            for name_key, email_val in EMAIL_UPDATES.items():
                if name_key.strip().lower() == cand_name.strip().lower():
                    new_email = email_val
                    break

        if new_email is None:
            not_found.append((cand_id, cand_name, old_email))
            continue

        if old_email.strip().lower() == new_email.strip().lower():
            already_correct += 1
            print(f"  [SKIP] ID {cand_id:4d} | {cand_name:35s} | Already correct: {old_email}")
            continue

        # Update the email
        try:
            c.execute("UPDATE candidates SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (new_email, cand_id))
            updated += 1
            print(f"  [UPDATE] ID {cand_id:4d} | {cand_name:35s} | {old_email} -> {new_email}")
        except Exception as e:
            errors.append((cand_id, cand_name, str(e)))
            print(f"  [ERROR] ID {cand_id:4d} | {cand_name:35s} | {e}")

    conn.commit()

    # Handle names in the update list that have no matching candidate (new candidates)
    matched_names = set()
    for _, cand_name, _ in candidates:
        for name_key in EMAIL_UPDATES:
            if name_key.strip().lower() == cand_name.strip().lower():
                matched_names.add(name_key)
                break

    extra_in_list = set(EMAIL_UPDATES.keys()) - matched_names

    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    print(f"  Total candidates found: {len(candidates)}")
    print(f"  Updated:                {updated}")
    print(f"  Already correct:        {already_correct}")
    print(f"  Not found in list:      {len(not_found)}")
    print(f"  Errors:                 {len(errors)}")

    if not_found:
        print(f"\n  Candidates NOT in your update list:")
        for cid, cname, cemail in not_found:
            print(f"    ID {cid}: {cname} ({cemail})")

    if extra_in_list:
        print(f"\n  Names in your list NOT matching any candidate:")
        for name in sorted(extra_in_list):
            print(f"    {name} -> {EMAIL_UPDATES[name]}")

    if errors:
        print(f"\n  Errors:")
        for cid, cname, err in errors:
            print(f"    ID {cid}: {cname} -> {err}")

    conn.close()
    print(f"\nDone! {updated} email(s) updated successfully.")

if __name__ == "__main__":
    main()
