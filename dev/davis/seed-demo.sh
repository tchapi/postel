#!/usr/bin/env bash
# Creates the Davis user "camille" with the contacts of the demo mailbox
# (dev/demo/mailbox.yaml), so recipient suggestions match the mail.
# Rerunning overwrites the same cards.
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
\""

# Name|email: the people of the demo mailbox, and a few more
contacts=(
  "Léa Moreau|lea.moreau@example.test"
  "Jonas Weber|jonas@northstudio.example"
  "Aïcha Diallo|aicha@northstudio.example"
  "Sam Okafor|sam.okafor@example.test"
  "Nina Martin|nina.martin@example.test"
  "Isabelle Martin|isabelle.martin@example.test"
  "Pierre Martin|pierre.martin@example.test"
  "Marc Dubois|marc.dubois@example.test"
  "Tom Garnier|tom.garnier@example.test"
  "Zoé Lambert|zoe.lambert@example.test"
  "Hugo Bernard|hugo.bernard@example.test"
  "Inès Rousseau|ines.rousseau@example.test"
  "Yuki Tanaka|yuki@northstudio.example"
  "Olivia Brown|olivia.brown@example.test"
  "Mateo Silva|mateo.silva@example.test"
  "Dr Anaïs Leroy|rdv@cabinet-leroy.example"
)

i=0
for entry in "${contacts[@]}"; do
  i=$((i + 1))
  name=${entry%%|*}
  email=${entry##*|}
  first=${name% *}
  last=${name##* }
  card=$(printf 'BEGIN:VCARD\r\nVERSION:3.0\r\nUID:demo-%d\r\nFN:%s\r\nN:%s;%s;;;\r\nEMAIL;TYPE=INTERNET:%s\r\nEND:VCARD\r\n' "$i" "$name" "$last" "$first" "$email")
  code=$(curl -s -o /dev/null -w '%{http_code}' -u "$USER:$PASSWORD" -X PUT -H 'Content-Type: text/vcard; charset=utf-8' --data-binary "$card" "$DAVIS/dav/addressbooks/$USER/contacts/demo-$i.vcf")
  case $code in 201|204) ;; *) echo "PUT demo-$i failed: $code" >&2; exit 1 ;; esac
done
echo "${#contacts[@]} contacts in $DAVIS/dav/addressbooks/$USER/contacts/"
