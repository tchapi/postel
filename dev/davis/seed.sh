#!/usr/bin/env bash
# Creates the CardDAV user "alice" with an address book and fills it with
# synthetic contacts. Idempotent enough: rerunning overwrites the same cards.
set -euo pipefail

DAVIS=http://127.0.0.1:9000
USER=alice
PASSWORD=alice-password
COUNT=${1:-300}

hash=$(docker exec webmail-dev-davis php -r "echo password_hash('$PASSWORD', PASSWORD_BCRYPT);")
# The bcrypt hash is full of "$", keep the inner shell from expanding them.
hash=${hash//\$/\\$}
docker exec -u www-data webmail-dev-davis sh -c "cd /var/www/davis && APP_ENV=prod bin/console doctrine:query:sql -q \"
  INSERT INTO users (username, digesta1) SELECT '$USER', '$hash' WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = '$USER');
  UPDATE users SET digesta1 = '$hash' WHERE username = '$USER';
  INSERT INTO principals (uri, email, displayname, is_main, is_admin) SELECT 'principals/$USER', '$USER@example.test', 'Alice', 1, 0 WHERE NOT EXISTS (SELECT 1 FROM principals WHERE uri = 'principals/$USER');
  INSERT INTO addressbooks (principaluri, uri, displayname, synctoken) SELECT 'principals/$USER', 'contacts', 'Contacts', 1 WHERE NOT EXISTS (SELECT 1 FROM addressbooks WHERE principaluri = 'principals/$USER' AND uri = 'contacts');
\""

firsts=(Alice Bob Carol Dave Erin Frank Grace Heidi Ivan Judy Mallory Niaj Olivia Peggy Rupert Sybil Trent Victor Walter Zoë François Émile Noémie)
lasts=(Martin Bernard Dubois Thomas Robert Richard Petit Durand Leroy Moreau Simon Laurent Lefebvre Michel Garcia David Bertrand Roux Vincent Fournier Dürr "O'Brien" "Smith-Jones")
domains=(example.test mail.example work.example)

for i in $(seq 1 "$COUNT"); do
  first=${firsts[$((RANDOM % ${#firsts[@]}))]}
  last=${lasts[$((RANDOM % ${#lasts[@]}))]}
  slug=$(printf '%s.%s' "$first" "$last" | LC_ALL=C tr -cd '[:alnum:].' | tr '[:upper:]' '[:lower:]')
  email="$slug$i@${domains[$((RANDOM % ${#domains[@]}))]}"
  card=$(printf 'BEGIN:VCARD\r\nVERSION:3.0\r\nUID:contact-%d\r\nFN:%s %s\r\nN:%s;%s;;;\r\nEMAIL;TYPE=INTERNET:%s\r\nEND:VCARD\r\n' "$i" "$first" "$last" "$last" "$first" "$email")
  code=$(curl -s -o /dev/null -w '%{http_code}' -u "$USER:$PASSWORD" -X PUT -H 'Content-Type: text/vcard; charset=utf-8' --data-binary "$card" "$DAVIS/dav/addressbooks/$USER/contacts/contact-$i.vcf")
  case $code in 201|204) ;; *) echo "PUT contact-$i failed: $code" >&2; exit 1 ;; esac
done
echo "$COUNT contacts in $DAVIS/dav/addressbooks/$USER/contacts/"
