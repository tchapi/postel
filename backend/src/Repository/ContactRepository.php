<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Contact;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

use function count;

use const PREG_SPLIT_NO_EMPTY;

/**
 * @extends ServiceEntityRepository<Contact>
 */
final class ContactRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Contact::class);
    }

    /**
     * Names or addresses that contain every word of the query, the ones
     * where a word starts with it first ("dur" puts Durand before Bédur).
     *
     * @return list<Contact>
     */
    public function search(string $owner, string $query, int $limit): array
    {
        $words = preg_split('/\s+/', Contact::fold(trim($query)), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        if ([] === $words) {
            return [];
        }

        $qb = $this->createQueryBuilder('c')
            ->andWhere('c.owner = :owner')
            ->setParameter('owner', $owner)
            // The search column is "name email", so this covers the address too
            ->addSelect("CASE WHEN c.search LIKE :start ESCAPE '!' OR c.search LIKE :wordStart ESCAPE '!' THEN 0 ELSE 1 END AS HIDDEN rank")
            ->setParameter('start', self::escape($words[0]).'%')
            ->setParameter('wordStart', '% '.self::escape($words[0]).'%')
            ->orderBy('rank')
            ->addOrderBy('c.name')
            ->addOrderBy('c.email')
            ->setMaxResults($limit * 2);
        foreach ($words as $i => $word) {
            $qb->andWhere("c.search LIKE :word{$i} ESCAPE '!'")->setParameter("word{$i}", '%'.self::escape($word).'%');
        }

        // The same address in two books shows once
        $seen = [];
        $contacts = [];
        foreach ($qb->getQuery()->getResult() as $contact) {
            if (!isset($seen[$contact->getEmail()]) && count($contacts) < $limit) {
                $seen[$contact->getEmail()] = true;
                $contacts[] = $contact;
            }
        }

        return $contacts;
    }

    /**
     * For each of these addresses that is in a book: the name on file (null for a
     * card without one) and whether the card has a picture.
     *
     * @param list<string> $emails
     *
     * @return array<string, array{name: ?string, photo: bool}>
     */
    public function namesByEmail(string $owner, array $emails): array
    {
        if ([] === $emails) {
            return [];
        }

        /** @var list<array{email: string, name: ?string, photoMime: ?string}> $rows */
        $rows = $this->createQueryBuilder('c')
            ->select('c.email', 'c.name', 'c.photoMime')
            ->andWhere('c.owner = :owner')
            ->andWhere('c.email IN (:emails)')
            ->setParameter('owner', $owner)
            ->setParameter('emails', array_map(strtolower(...), $emails))
            ->addOrderBy('c.name')
            ->getQuery()
            ->getArrayResult();

        $found = [];
        foreach ($rows as $row) {
            // The same address in two books: the first name wins, a picture from any book counts
            $entry = $found[$row['email']] ?? ['name' => null, 'photo' => false];
            $entry['name'] ??= $row['name'];
            $entry['photo'] = $entry['photo'] || null !== $row['photoMime'];
            $found[$row['email']] = $entry;
        }

        return $found;
    }

    /**
     * The picture on this address's card, from whichever book has one.
     *
     * @return ?array{mime: string, data: string}
     */
    public function findPhoto(string $owner, string $email): ?array
    {
        $contacts = $this->createQueryBuilder('c')
            ->andWhere('c.owner = :owner')
            ->andWhere('c.email = :email')
            ->andWhere('c.photoMime IS NOT NULL')
            ->setParameter('owner', $owner)
            ->setParameter('email', strtolower($email))
            ->setMaxResults(1)
            ->getQuery()
            ->getResult();
        $contact = $contacts[0] ?? null;
        if (!$contact instanceof Contact) {
            return null;
        }
        $data = $contact->getPhoto();
        $mime = $contact->getPhotoMime();

        return null === $data || null === $mime ? null : ['mime' => $mime, 'data' => $data];
    }

    /**
     * Drops what a book had before it is filled again.
     */
    public function deleteBook(string $owner, string $book): void
    {
        $this->createQueryBuilder('c')
            ->delete()
            ->where('c.owner = :owner AND c.book = :book')
            ->setParameter('owner', $owner)
            ->setParameter('book', $book)
            ->getQuery()
            ->execute();
    }

    private static function escape(string $text): string
    {
        return str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $text);
    }
}
