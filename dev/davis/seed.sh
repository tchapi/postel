#!/usr/bin/env bash
# Creates the CardDAV user "alice" with two address books and fills them with
# synthetic contacts, plus a few cards with every kind of field. Idempotent enough: rerunning overwrites the same cards.
set -euo pipefail

DAVIS=http://127.0.0.1:9000
USER=alice
PASSWORD=alice-password
COUNT=${1:-300}

hash=$(docker exec postel-dev-davis php -r "echo password_hash('$PASSWORD', PASSWORD_BCRYPT);")
# The bcrypt hash is full of "$", keep the inner shell from expanding them.
hash=${hash//\$/\\$}
docker exec -u www-data postel-dev-davis sh -c "cd /var/www/davis && APP_ENV=prod bin/console doctrine:query:sql -q \"
  INSERT INTO users (username, digesta1) SELECT '$USER', '$hash' WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = '$USER');
  UPDATE users SET digesta1 = '$hash' WHERE username = '$USER';
  INSERT INTO principals (uri, email, displayname, is_main, is_admin) SELECT 'principals/$USER', '$USER@example.test', 'Alice', 1, 0 WHERE NOT EXISTS (SELECT 1 FROM principals WHERE uri = 'principals/$USER');
  INSERT INTO addressbooks (principaluri, uri, displayname, synctoken) SELECT 'principals/$USER', 'contacts', 'Contacts', 1 WHERE NOT EXISTS (SELECT 1 FROM addressbooks WHERE principaluri = 'principals/$USER' AND uri = 'contacts');
  INSERT INTO addressbooks (principaluri, uri, displayname, synctoken) SELECT 'principals/$USER', 'work', 'Work', 1 WHERE NOT EXISTS (SELECT 1 FROM addressbooks WHERE principaluri = 'principals/$USER' AND uri = 'work');
\""

# put <book> <name> <card>: the lines of the card are joined with CRLF
put() {
  local card
  card=$(printf '%s\r\n' "${@:3}")
  code=$(curl -s -o /dev/null -w '%{http_code}' -u "$USER:$PASSWORD" -X PUT -H 'Content-Type: text/vcard; charset=utf-8' --data-binary "$card" "$DAVIS/dav/addressbooks/$USER/$1/$2.vcf")
  case $code in 201|204) ;; *) echo "PUT $1/$2 failed: $code" >&2; exit 1 ;; esac
}

firsts=(Alice Bob Carol Dave Erin Frank Grace Heidi Ivan Judy Mallory Niaj Olivia Peggy Rupert Sybil Trent Victor Walter Zoë François Émile Noémie)
lasts=(Martin Bernard Dubois Thomas Robert Richard Petit Durand Leroy Moreau Simon Laurent Lefebvre Michel Garcia David Bertrand Roux Vincent Fournier Dürr "O'Brien" "Smith-Jones")
domains=(example.test mail.example work.example)

for i in $(seq 1 "$COUNT"); do
  first=${firsts[$((RANDOM % ${#firsts[@]}))]}
  last=${lasts[$((RANDOM % ${#lasts[@]}))]}
  slug=$(printf '%s.%s' "$first" "$last" | LC_ALL=C tr -cd '[:alnum:].' | tr '[:upper:]' '[:lower:]')
  email="$slug$i@${domains[$((RANDOM % ${#domains[@]}))]}"
  put contacts "contact-$i" BEGIN:VCARD VERSION:3.0 "UID:contact-$i" "FN:$first $last" "N:$last;$first;;;" "EMAIL;TYPE=INTERNET:$email" END:VCARD
done

# A few cards with everything the address book shows, and the odd shapes it must keep intact
PHOTO=/9j/4AAQSkZJRgABAQEAYABgAAD//gA7Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcgSlBFRyB2ODApLCBxdWFsaXR5ID0gNzAK/9sAQwAKBwcIBwYKCAgICwoKCw4YEA4NDQ4dFRYRGCMfJSQiHyIhJis3LyYpNCkhIjBBMTQ5Oz4+PiUuRElDPEg3PT47/9sAQwEKCwsODQ4cEBAcOygiKDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7/8AAEQgAQABAAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDAQACEQMRAD8Ar0UUV7h4gUUVZtNNvb8gWttJIMkbgMKDjOCTwKTaSuxpNuyK1FXLvSdQsQWubWRFABLgblHOOSOKp0KSkrpg4uLs0FFFFMQUUUUAaGiaX/a2oC3MmxFXe5HXAIGB7816DBBFawJBAgSNBhVHauU8FTKtzdQEHc6K4PbAJB/9CFdfXjY2cnU5Xsj2MFCKp8y3Y10WRGR1DKwwVIyCPSuE8RaOmlXSNC2YZ8lFPVMYyPccjH+Se9rm/GkyrY28BB3PKXB7YAwf/QhU4Oco1Ul1KxcIyptvocdRRRXtnihRRRQBJBPLazpPA5SRDlWHau20zxPY3cKLcyrb3B4ZWyFOO4PQD6n/AOvxtnYXV/IY7WBpSOpHQfU9B0rdg8FXLbvtF5FH/d8tS+fzxiuPEqjLSbszrwzrR1gro277xJptnG22dZ5QuVSI53f8CHArh76+n1G6a4uH3O3AA6KPQe1b03gqZUBgvY3bPIdCox9RmsW/0q9018XMJC5wJByrde/4dOtThlQj8DuysS68vjVkU6KKK7jiCtHRNJbV73yyxSJBukcDt6D3P+PpWdXeeFIVi0KN1JJmdnbPY528fgormxNV06d1udGGpKpUs9jVggitYEggQJGgwqjtUlFFeE3fVnuJWCmuiyIyOoZWGCpGQR6U6igDg/EWiDSp1lgybaUnaDk7D6E/y78H0zWNXo2uQrPol2jkgCIvx6r8w/UV5zXt4Sq6kPe3R4uKpKnPTZn/2Q==
put contacts full BEGIN:VCARD VERSION:3.0 UID:seed-full "FN:Émile Durand" "N:Durand;Émile;;;" ORG:Example "TITLE:Engineer" \
  "EMAIL;TYPE=INTERNET;TYPE=WORK:emile@example.test" "EMAIL;TYPE=INTERNET;TYPE=HOME:emile.durand@mail.example" \
  "TEL;TYPE=CELL:+33 6 00 00 00 01" "TEL;TYPE=WORK:+33 1 00 00 00 01" \
  "ADR;TYPE=HOME:;;12 rue des Lilas;Lyon;;69001;France" "URL:https://example.test/emile" \
  BDAY:1984-03-12 "NOTE:Met at the conference.\\nLikes tea\\, not coffee." "PHOTO;ENCODING=b;TYPE=JPEG:$PHOTO" END:VCARD
put contacts no-email BEGIN:VCARD VERSION:3.0 UID:seed-no-email "FN:Plumber" ORG:Fix-It "TEL;TYPE=WORK:+33 4 00 00 00 02" END:VCARD
put contacts version-4 BEGIN:VCARD VERSION:4.0 UID:seed-version-4 "FN:Noémie Roux" "N:Roux;Noémie;;;" \
  "EMAIL;TYPE=work:noemie@work.example" "TEL;VALUE=uri;TYPE=cell:tel:+33-6-00-00-00-03" "BDAY:--0704" END:VCARD
put contacts apple BEGIN:VCARD VERSION:3.0 "PRODID:-//Apple Inc.//iPhone OS 17.0//EN" UID:seed-apple "FN:Grace Moreau" "N:Moreau;Grace;;;" \
  "item1.EMAIL;type=INTERNET;type=pref:grace@example.test" "item1.X-ABLabel:_\$!<Other>!\$_" \
  "item2.TEL:+33 6 00 00 00 04" "item2.X-ABLabel:Boat" \
  "item3.ADR;type=HOME;type=pref:;;1 quai du Port;Marseille;;13002;France" "item3.X-ABADR:fr" \
  "BDAY;X-APPLE-OMIT-YEAR=1604:1604-11-02" "X-SOCIALPROFILE;type=mastodon:https://social.example/@grace" "IMPP;X-SERVICE-TYPE=Jabber:xmpp:grace@chat.example" END:VCARD
put contacts duplicate-1 BEGIN:VCARD VERSION:3.0 UID:seed-duplicate-1 "FN:Victor Laurent" "N:Laurent;Victor;;;" "EMAIL;TYPE=INTERNET:victor.laurent@example.test" END:VCARD
put contacts duplicate-2 BEGIN:VCARD VERSION:3.0 UID:seed-duplicate-2 "FN:Victor Laurent" "N:Laurent;Victor;;;" "EMAIL;TYPE=INTERNET:victor@work.example" "TEL;TYPE=CELL:+33 6 00 00 00 05" "ORG:Laurent & Fils" END:VCARD

# A second address book
put work colleague-1 BEGIN:VCARD VERSION:3.0 UID:seed-work-1 "FN:Carol Petit" "N:Petit;Carol;;;" ORG:Work "EMAIL;TYPE=INTERNET;TYPE=WORK:carol@work.example" END:VCARD
put work colleague-2 BEGIN:VCARD VERSION:3.0 UID:seed-work-2 "FN:Trent Simon" "N:Simon;Trent;;;" ORG:Work "EMAIL;TYPE=INTERNET;TYPE=WORK:trent@work.example" "TEL;TYPE=WORK:+33 1 00 00 00 06" END:VCARD

echo "$COUNT contacts and a few special ones in $DAVIS/dav/addressbooks/$USER/contacts/, 2 in $DAVIS/dav/addressbooks/$USER/work/"
