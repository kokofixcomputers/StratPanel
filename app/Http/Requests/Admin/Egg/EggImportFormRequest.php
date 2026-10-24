<?php

namespace Pterodactyl\Http\Requests\Admin\Egg;

use Pterodactyl\Http\Requests\Admin\AdminFormRequest;

class EggImportFormRequest extends AdminFormRequest
{
    public function rules(): array
    {
        $rules = [
            'import_file' => 'bail|required|file|max:1000|mimetypes:application/json,text/plain',
        ];

        // Importing into an egg that is there (a route with that egg in it) needs no nest.
        if (!$this->route('egg')) {
            $rules['import_to_nest'] = 'bail|required|integer|exists:nests,id';
        }

        return $rules;
    }
}
