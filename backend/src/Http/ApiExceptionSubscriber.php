<?php

declare(strict_types=1);

namespace App\Http;

use App\Imap\Exception\ImapCommandFailed;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\KernelEvents;
use Webklex\PHPIMAP\Exceptions\AuthFailedException;
use Webklex\PHPIMAP\Exceptions\ConnectionFailedException;

/**
 * Every error under /api is JSON, IMAP failures included.
 */
final class ApiExceptionSubscriber implements EventSubscriberInterface
{
    public function __construct(
        #[Autowire('%kernel.debug%')]
        private readonly bool $debug,
    ) {
    }

    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::EXCEPTION => 'onException'];
    }

    public function onException(ExceptionEvent $event): void
    {
        $request = $event->getRequest();
        if (!str_starts_with($request->getPathInfo(), '/api')) {
            return;
        }

        $exception = $event->getThrowable();

        [$status, $error] = match (true) {
            $exception instanceof HttpExceptionInterface => [$exception->getStatusCode(), $exception->getMessage() ?: Response::$statusTexts[$exception->getStatusCode()] ?? 'error'],
            $exception instanceof AuthFailedException => [Response::HTTP_BAD_GATEWAY, 'imap_auth_failed'],
            $exception instanceof ImapCommandFailed => [Response::HTTP_BAD_GATEWAY, 'imap_command_failed'],
            $exception instanceof ConnectionFailedException => [Response::HTTP_BAD_GATEWAY, 'imap_unreachable'],
            default => [Response::HTTP_INTERNAL_SERVER_ERROR, 'internal_error'],
        };

        $payload = ['error' => $error];
        if ($this->debug) {
            $payload['detail'] = $exception->getMessage();
        }

        $event->setResponse(new JsonResponse($payload, $status));
    }
}
