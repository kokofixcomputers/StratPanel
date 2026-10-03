<?php

namespace Pterodactyl\Http\Requests\Api\Client;

use Pterodactyl\Models\Server;

class CreateServerRequest extends ClientApiRequest
{
    /**
     * Rules to be applied to this request.
     */
    public function rules(): array
    {
        $rules = Server::getRules();

        return [
            'name' => $rules['name'],
            'description' => array_merge(['nullable'], $rules['description']),
            'node_id' => 'sometimes|nullable|integer|exists:nodes,id',
            // Optional resource overrides, they can never exceed the limits set in the panel configuration.
            'memory' => ['sometimes', 'integer', 'min:512', 'max:' . max(512, (int) config('pterodactyl.self_service.max_memory'))],
            'disk' => ['sometimes', 'integer', 'min:1024', 'max:' . max(1024, (int) config('pterodactyl.self_service.max_disk'))],
            'cpu' => ['sometimes', 'integer', 'min:50', 'max:' . max(50, (int) config('pterodactyl.self_service.max_cpu'))],
        ];
    }
}
