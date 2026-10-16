<?php

namespace Pterodactyl\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

abstract class AdminFormRequest extends FormRequest
{
    /**
     * The rules to apply to the incoming form request.
     */
    abstract public function rules(): array;

    /**
     * Determine if the user may be in the admin area at all. What they may do there is checked by the "admin.can" middleware of
     * the route the form is sent to.
     */
    public function authorize(): bool
    {
        if (is_null($this->user())) {
            return false;
        }

        return $this->user()->canAccessAdmin();
    }

    /**
     * Return only the fields that we are interested in from the request.
     * This will include empty fields as a null value.
     */
    public function normalize(?array $only = null): array
    {
        return $this->only($only ?? array_keys($this->rules()));
    }
}
