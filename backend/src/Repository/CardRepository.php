<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Card;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * Every query here is for one owner: a card id from another user is not found.
 *
 * @extends ServiceEntityRepository<Card>
 */
final class CardRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Card::class);
    }

    public function findOwned(string $owner, string $id): ?Card
    {
        return $this->findOneBy(['owner' => $owner, 'id' => $id]);
    }

    /**
     * @return list<Card> sorted by name
     */
    public function findAllOwned(string $owner, ?string $book = null): array
    {
        $criteria = ['owner' => $owner];
        if (null !== $book) {
            $criteria['book'] = $book;
        }

        return $this->findBy($criteria, ['sort' => 'ASC', 'id' => 'ASC']);
    }

    /**
     * @return array<string, Card> by href
     */
    public function byHref(string $owner, string $book): array
    {
        $cards = [];
        foreach ($this->findBy(['owner' => $owner, 'book' => $book]) as $card) {
            $cards[$card->getHref()] = $card;
        }

        return $cards;
    }

    /**
     * The UIDs of a book's cards, read from the cached text.
     *
     * @return array<string, true>
     */
    public function uids(string $owner, string $book): array
    {
        /** @var list<string> $cards */
        $cards = $this->createQueryBuilder('c')
            ->select('c.vcard')
            ->andWhere('c.owner = :owner AND c.book = :book')
            ->setParameter('owner', $owner)
            ->setParameter('book', $book)
            ->getQuery()
            ->getSingleColumnResult();

        $uids = [];
        foreach ($cards as $vcard) {
            // "UID:x" or "UID;VALUE=text:x", on an unfolded line
            if (1 === preg_match('/^UID(?:;[^:\r\n]*)?:([^\r\n]*)\r?$/mi', preg_replace("/\r?\n[ \t]/", '', $vcard) ?? $vcard, $m)) {
                $uids[trim($m[1])] = true;
            }
        }

        return $uids;
    }

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
}
