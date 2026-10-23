<?php

declare(strict_types=1);

namespace App\Security;

use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Exception\AuthenticationException;
use Symfony\Component\Security\Http\Authenticator\AbstractAuthenticator;
use Symfony\Component\Security\Http\Authenticator\Passport\Badge\UserBadge;
use Symfony\Component\Security\Http\Authenticator\Passport\Passport;
use Symfony\Component\Security\Http\Authenticator\Passport\SelfValidatingPassport;
use Symfony\Component\Security\Http\EntryPoint\AuthenticationEntryPointInterface;

/**
 * Trusts the identity headers set by the forward-auth proxy (Authelia behind Traefik).
 *
 * The headers are only honoured when the request comes from a trusted proxy,
 * otherwise anyone reaching the container directly could impersonate anyone.
 */
final class RemoteUserAuthenticator extends AbstractAuthenticator implements AuthenticationEntryPointInterface
{
    public const string USER_HEADER = 'Remote-User';
    public const string EMAIL_HEADER = 'Remote-Email';
    public const string NAME_HEADER = 'Remote-Name';

    public function supports(Request $request): bool
    {
        return $request->isFromTrustedProxy() && $request->headers->has(self::USER_HEADER);
    }

    public function authenticate(Request $request): Passport
    {
        $username = trim((string) $request->headers->get(self::USER_HEADER));
        $email = trim((string) $request->headers->get(self::EMAIL_HEADER));
        $name = trim((string) $request->headers->get(self::NAME_HEADER));

        if ('' === $username || '' === $email) {
            throw new AuthenticationException('Missing identity headers.');
        }

        return new SelfValidatingPassport(
            new UserBadge($username, static fn () => new RemoteUser($username, $email, '' === $name ? null : $name)),
        );
    }

    public function onAuthenticationSuccess(Request $request, TokenInterface $token, string $firewallName): ?Response
    {
        return null;
    }

    public function onAuthenticationFailure(Request $request, AuthenticationException $exception): Response
    {
        return $this->unauthorized();
    }

    public function start(Request $request, ?AuthenticationException $authException = null): Response
    {
        return $this->unauthorized();
    }

    private function unauthorized(): JsonResponse
    {
        return new JsonResponse(['error' => 'unauthenticated'], Response::HTTP_UNAUTHORIZED);
    }
}
