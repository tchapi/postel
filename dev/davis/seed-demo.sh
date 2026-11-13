#!/usr/bin/env bash
# Creates the Davis user "camille" with the contacts of the demo mailbox
# (dev/demo/mailbox.yaml), so recipient suggestions match the mail, in two
# address books that read like real ones. Rerunning overwrites the same cards.
set -euo pipefail

DAVIS=http://127.0.0.1:9000
USER=camille
PASSWORD=camille-password

hash=$(docker exec postel-dev-davis php -r "echo password_hash('$PASSWORD', PASSWORD_BCRYPT);")
# The bcrypt hash is full of "$", keep the inner shell from expanding them.
hash=${hash//\$/\\$}
docker exec -u www-data postel-dev-davis sh -c "cd /var/www/davis && APP_ENV=prod bin/console doctrine:query:sql -q \"
  INSERT INTO users (username, digesta1) SELECT '$USER', '$hash' WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = '$USER');
  UPDATE users SET digesta1 = '$hash' WHERE username = '$USER';
  INSERT INTO principals (uri, email, displayname, is_main, is_admin) SELECT 'principals/$USER', '$USER@example.test', 'Camille Martin', 1, 0 WHERE NOT EXISTS (SELECT 1 FROM principals WHERE uri = 'principals/$USER');
  INSERT INTO addressbooks (principaluri, uri, displayname, synctoken) SELECT 'principals/$USER', 'contacts', 'Contacts', 1 WHERE NOT EXISTS (SELECT 1 FROM addressbooks WHERE principaluri = 'principals/$USER' AND uri = 'contacts');
  INSERT INTO addressbooks (principaluri, uri, displayname, synctoken) SELECT 'principals/$USER', 'work', 'North Studio', 1 WHERE NOT EXISTS (SELECT 1 FROM addressbooks WHERE principaluri = 'principals/$USER' AND uri = 'work');
\""

# put <book> <id> <name> <family;given> <line>...: one card, each further argument a line of it
count=0
put() {
  local book=$1 id=$2 name=$3 n=$4
  shift 4
  local card
  card=$(printf '%s\r\n' BEGIN:VCARD VERSION:3.0 "UID:demo-$id" "FN:$name" "N:$n;;;" "$@" END:VCARD)
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -u "$USER:$PASSWORD" -X PUT -H 'Content-Type: text/vcard; charset=utf-8' --data-binary "$card"$'\r\n' "$DAVIS/dav/addressbooks/$USER/$book/demo-$id.vcf")
  case $code in 201|204) count=$((count + 1)) ;; *) echo "PUT demo-$id failed: $code" >&2; exit 1 ;; esac
}

# A few people have a picture: small drawn avatars, in dev/demo/avatars
photo() {
  printf 'PHOTO;ENCODING=b;TYPE=JPEG:%s' "$(base64 < "$(dirname "$0")/../demo/avatars/$1.jpg" | tr -d '\n')"
}

# Friends and family: the people of the demo mailbox, and a few more
put contacts lea "Léa Moreau" "Moreau;Léa" "EMAIL;TYPE=INTERNET;TYPE=HOME:lea.moreau@example.test" "TEL;TYPE=CELL:+33 6 12 55 01 42" \
  "ADR;TYPE=HOME:;;8 rue des Capucins;Lyon;;69001;France" BDAY:1991-04-18 "NOTE:Vegetarian. Best dessert radar in town." "$(photo lea)"
put contacts sam "Sam Okafor" "Okafor;Sam" "EMAIL;TYPE=INTERNET;TYPE=HOME:sam.okafor@example.test" "TEL;TYPE=CELL:+33 6 12 55 01 77"
# The same Sam, as a phone saved him: a duplicate to merge
put contacts sam-2 "Sam Okafor" "Okafor;Sam" "ORG:Bloc Up" "EMAIL;TYPE=INTERNET;TYPE=WORK:sam@blocup.example" "TEL;TYPE=CELL:+33 6 12 55 01 77" "NOTE:Climbing on Sundays."
put contacts nina "Nina Martin" "Martin;Nina" "EMAIL;TYPE=INTERNET;TYPE=HOME:nina.martin@example.test" "TEL;TYPE=CELL:+33 6 12 55 01 08" BDAY:1994-09-02 "$(photo nina)"
put contacts isabelle "Isabelle Martin" "Martin;Isabelle" "EMAIL;TYPE=INTERNET;TYPE=HOME:isabelle.martin@example.test" "TEL;TYPE=HOME:+33 4 72 55 01 30" "TEL;TYPE=CELL:+33 6 12 55 01 31" \
  "ADR;TYPE=HOME:;;14 chemin des Vignes;Annecy;;74000;France" BDAY:1962-11-07 "$(photo isabelle)"
put contacts pierre "Pierre Martin" "Martin;Pierre" "EMAIL;TYPE=INTERNET;TYPE=HOME:pierre.martin@example.test" "TEL;TYPE=CELL:+33 6 12 55 01 32"
put contacts marc "Marc Dubois" "Dubois;Marc" "EMAIL;TYPE=INTERNET;TYPE=HOME:marc.dubois@example.test" "TEL;TYPE=CELL:+33 6 12 55 01 64"
put contacts tom "Tom Garnier" "Garnier;Tom" "EMAIL;TYPE=INTERNET;TYPE=HOME:tom.garnier@example.test"
put contacts zoe "Zoé Lambert" "Lambert;Zoé" "EMAIL;TYPE=INTERNET;TYPE=HOME:zoe.lambert@example.test" "TEL;TYPE=CELL:+33 6 12 55 01 90" "URL:https://zoelambert.example"
put contacts hugo "Hugo Bernard" "Bernard;Hugo" "EMAIL;TYPE=INTERNET;TYPE=HOME:hugo.bernard@example.test" "TEL;TYPE=CELL:+33 6 12 55 01 15"
put contacts ines "Inès Rousseau" "Rousseau;Inès" "EMAIL;TYPE=INTERNET;TYPE=HOME:ines.rousseau@example.test" BDAY:--06-21
put contacts olivia "Olivia Brown" "Brown;Olivia" "EMAIL;TYPE=INTERNET;TYPE=HOME:olivia.brown@example.test" "TEL;TYPE=CELL:+44 7700 900142" "ADR;TYPE=HOME:;;27 Marlowe Road;Bristol;;BS6 5PQ;United Kingdom"
put contacts mateo "Mateo Silva" "Silva;Mateo" "EMAIL;TYPE=INTERNET;TYPE=HOME:mateo.silva@example.test" "TEL;TYPE=CELL:+351 912 555 018"
put contacts leroy "Dr Anaïs Leroy" "Leroy;Anaïs" "ORG:Cabinet Leroy" "TITLE:General practitioner" "EMAIL;TYPE=INTERNET;TYPE=WORK:rdv@cabinet-leroy.example" "TEL;TYPE=WORK:+33 4 78 55 01 20" \
  "ADR;TYPE=WORK:;;3 place Sathonay;Lyon;;69001;France"
put contacts tilleuls "Résidence Les Tilleuls" ";" "ORG:Résidence Les Tilleuls" "EMAIL;TYPE=INTERNET;TYPE=WORK:gestion@lestilleuls.example" "TEL;TYPE=WORK:+33 4 78 55 01 61" "NOTE:Building manager. Office open on weekday mornings."

# Colleagues, in a book of their own
put work aicha "Aïcha Diallo" "Diallo;Aïcha" "ORG:North Studio" "TITLE:Design lead" "EMAIL;TYPE=INTERNET;TYPE=WORK:aicha@northstudio.example" "EMAIL;TYPE=INTERNET;TYPE=HOME:aicha.diallo@example.test" \
  "TEL;TYPE=CELL:+33 6 12 55 01 23" "TEL;TYPE=WORK:+33 4 78 55 01 02" "ADR;TYPE=WORK:;;21 quai Saint-Antoine;Lyon;;69002;France" \
  "URL:https://northstudio.example/team/aicha" BDAY:1988-02-14 "NOTE:Runs the Thursday design review.\\nPrefers mockups a day ahead." "$(photo aicha)"
put work jonas "Jonas Weber" "Weber;Jonas" "ORG:North Studio" "TITLE:Front-end developer" "EMAIL;TYPE=INTERNET;TYPE=WORK:jonas@northstudio.example" "TEL;TYPE=CELL:+49 151 555 0142" "URL:https://jonasweber.example" "$(photo jonas)"
put work yuki "Yuki Tanaka" "Tanaka;Yuki" "ORG:North Studio" "TITLE:Project manager" "EMAIL;TYPE=INTERNET;TYPE=WORK:yuki@northstudio.example" "TEL;TYPE=WORK:+33 4 78 55 01 04"
put work people "North Studio" ";" "ORG:North Studio;People" "EMAIL;TYPE=INTERNET;TYPE=WORK:people@northstudio.example" "TEL;TYPE=WORK:+33 4 78 55 01 00" "URL:https://northstudio.example"

echo "$count contacts in $DAVIS/dav/addressbooks/$USER/ (contacts and work)"
