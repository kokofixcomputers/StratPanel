<?php

namespace Pterodactyl\Http\Requests\Admin\Settings;

use Illuminate\Validation\Rule;
use Pterodactyl\Services\Branding\BrandingService;
use Pterodactyl\Http\Requests\Admin\AdminFormRequest;

class BrandingFormRequest extends AdminFormRequest
{
    // A link has to go to another site or to a page of this panel. Anything else, javascript: above all, is refused.
    private const URL = ['required', 'string', 'max:500', 'regex:/^(https?:\/\/|\/(?!\/))\S+$/i'];

    public function rules(): array
    {
        return [
            'favicon' => 'nullable|file|mimes:png,ico,gif,jpg,jpeg|max:512',
            'remove_favicon' => 'nullable|boolean',

            'announcements' => 'nullable|array|max:20',
            'announcements.*.id' => 'nullable|string|max:32',
            'announcements.*.title' => 'nullable|string|max:100',
            'announcements.*.message' => 'required|string|max:1000',
            'announcements.*.type' => ['required', Rule::in(BrandingService::TYPES)],
            'announcements.*.enabled' => 'nullable|boolean',
            'announcements.*.dismissible' => 'nullable|boolean',
            'announcements.*.link_label' => 'nullable|string|max:50',
            'announcements.*.link_url' => ['nullable', 'string', 'max:500', 'regex:/^(https?:\/\/|\/(?!\/))\S+$/i'],

            'links' => 'nullable|array|max:20',
            'links.*.label' => 'required|string|max:50',
            'links.*.url' => self::URL,
            'links.*.location' => ['required', Rule::in(array_keys(BrandingService::LOCATIONS))],
            'links.*.new_tab' => 'nullable|boolean',
        ];
    }

    public function attributes(): array
    {
        return [
            'favicon' => 'Favicon',
            'announcements.*.message' => 'announcement message',
            'announcements.*.link_url' => 'announcement link',
            'links.*.label' => 'link label',
            'links.*.url' => 'link address',
        ];
    }

    public function messages(): array
    {
        return [
            'announcements.*.link_url.regex' => 'An announcement link must start with http://, https:// or /.',
            'links.*.url.regex' => 'A link address must start with http://, https:// or /.',
        ];
    }
}
