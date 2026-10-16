<?php

namespace Stratosphere\OfflineMotd;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Permission;
use Pterodactyl\Extensions\Extension;

/**
 * What players see when a server is off, in the server list and when they try to join. The router asks the panel what to show, and
 * this adds a message to the answer ("router.state"). The words come from the setting of the admin, or from the owner of the server.
 * The owner sets theirs on the Settings page of the server, which this extension adds a card to (web/index.js) and talks to through
 * the routes below.
 */
class OfflineMotd extends Extension
{
    /** The longest message, a server list entry cannot show more than a few lines anyway. */
    private const MAX_LENGTH = 300;

    public function register(): void
    {
        $this->context->filter('router.state', fn (array $answer, Server $server) => $this->withNotice($answer, $server));
    }

    public function boot(): void
    {
        $this->context->clientRoutes(function ($router) {
            $router->get('/servers/{server}/message', fn (Request $request, Server $server) => $this->show($request, $server));
            $router->put('/servers/{server}/message', fn (Request $request, Server $server) => $this->save($request, $server));
        });
    }

    /** The message for a server: its owner's, or the one of the admin, or nothing when there is neither. */
    private function messageFor(Server $server): ?string
    {
        if ($this->context->setting('allow_server_messages', true)) {
            $own = $this->context->store()->get('server.' . $server->id);
            if (is_string($own) && trim($own) !== '') {
                return $own;
            }
        }

        $general = (string) $this->context->setting('message', '');

        return trim($general) === '' ? null : $general;
    }

    /**
     * Adds the message to what the router is told, for a server that is off.
     *
     * @param  array<string, mixed>  $answer
     * @return array<string, mixed>
     */
    private function withNotice(array $answer, Server $server): array
    {
        if (($answer['state'] ?? null) !== 'offline') {
            return $answer;
        }
        if (!empty($answer['sleeping']) && !$this->context->setting('include_sleeping', false)) {
            return $answer;
        }

        $message = $this->messageFor($server);
        if ($message === null) {
            return $answer;
        }

        $answer['notice'] = [
            'label' => (string) $this->context->setting('label', 'Offline'),
            'message' => str_replace('{server}', $server->name, $message),
        ];

        return $answer;
    }

    /** {server} in a client route is already the server model, found by the panel the same way as everywhere else. */
    private function show(Request $request, Server $server): JsonResponse
    {
        // The panel's own rule for who may change the settings of a server (owners and admins always may).
        abort_unless($request->user()->can(Permission::ACTION_SETTINGS_RENAME, $server), 404);

        $allowed = (bool) $this->context->setting('allow_server_messages', true);
        $own = $this->context->store()->get('server.' . $server->id);

        return new JsonResponse([
            'allowed' => $allowed,
            'can_edit' => $allowed,
            'message' => is_string($own) ? $own : null,
            'default' => (string) $this->context->setting('message', ''),
            'label' => (string) $this->context->setting('label', 'Offline'),
            'max_length' => self::MAX_LENGTH,
        ]);
    }

    private function save(Request $request, Server $server): JsonResponse
    {
        abort_unless($request->user()->can(Permission::ACTION_SETTINGS_RENAME, $server), 403);

        if (!$this->context->setting('allow_server_messages', true)) {
            return new JsonResponse(['errors' => [['code' => 'NotAllowed', 'status' => '403', 'detail' => 'The admin does not let servers set their own offline message.']]], 403);
        }

        $data = $request->validate(['message' => 'nullable|string|max:' . self::MAX_LENGTH]);
        $message = trim((string) ($data['message'] ?? ''));

        if ($message === '') {
            $this->context->store()->forget('server.' . $server->id);
        } else {
            $this->context->store()->put('server.' . $server->id, $message);
        }

        return $this->show($request, $server);
    }
}
