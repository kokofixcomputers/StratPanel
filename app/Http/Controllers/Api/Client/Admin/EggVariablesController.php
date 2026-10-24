<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin;

use Pterodactyl\Models\Egg;
use Pterodactyl\Models\EggVariable;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Eggs\Scripts\InstallScriptService;
use Pterodactyl\Services\Eggs\Variables\VariableCreationService;
use Pterodactyl\Services\Eggs\Variables\VariableUpdateService;
use Pterodactyl\Http\Requests\Admin\Egg\EggScriptFormRequest;
use Pterodactyl\Http\Requests\Admin\Egg\EggVariableFormRequest;

/** The variables and the install script of an egg, for the admin pages. */
class EggVariablesController extends Controller
{
    public function __construct(
        private VariableCreationService $creation,
        private VariableUpdateService $update,
        private InstallScriptService $scripts,
    ) {
    }

    public function index(int $egg): JsonResponse
    {
        return new JsonResponse($this->variables(Egg::query()->with(['variables', 'nest'])->findOrFail($egg)));
    }

    public function store(EggVariableFormRequest $request, int $egg): JsonResponse
    {
        $this->creation->handle(Egg::query()->findOrFail($egg)->id, $request->normalize());

        return new JsonResponse($this->variables(Egg::query()->with(['variables', 'nest'])->findOrFail($egg)), 201);
    }

    public function updateVariable(EggVariableFormRequest $request, int $egg, int $variable): JsonResponse
    {
        $this->update->handle(EggVariable::query()->where('egg_id', $egg)->findOrFail($variable), $request->normalize());

        return new JsonResponse($this->variables(Egg::query()->with(['variables', 'nest'])->findOrFail($egg)));
    }

    public function destroy(int $egg, int $variable): JsonResponse
    {
        EggVariable::query()->where('egg_id', $egg)->findOrFail($variable)->delete();

        return new JsonResponse([], 204);
    }

    public function script(int $egg): JsonResponse
    {
        $found = Egg::query()->with(['scriptFrom', 'nest'])->findOrFail($egg);

        return new JsonResponse([
            'id' => $found->id,
            'name' => $found->name,
            'nest' => ['id' => $found->nest->id, 'name' => $found->nest->name],
            'script_install' => (string) $found->script_install,
            'script_container' => (string) $found->script_container,
            'script_entry' => (string) $found->script_entry,
            'script_is_privileged' => (bool) $found->script_is_privileged,
            'copy_script_from' => $found->copy_script_from,
            'copying_from' => $found->scriptFrom ? ['id' => $found->scriptFrom->id, 'name' => $found->scriptFrom->name] : null,
            // The eggs of the nest this one can take the script from, and the ones that rely on this one.
            'copy_options' => Egg::query()->where('nest_id', $found->nest_id)->whereNull('copy_script_from')->where('id', '!=', $found->id)->orderBy('name')->get(['id', 'name'])->map(fn (Egg $other) => ['id' => $other->id, 'name' => $other->name])->all(),
            'relied_on_by' => Egg::query()->where('copy_script_from', $found->id)->orderBy('name')->get(['id', 'name'])->map(fn (Egg $other) => ['id' => $other->id, 'name' => $other->name])->all(),
        ]);
    }

    public function updateScript(EggScriptFormRequest $request, int $egg): JsonResponse
    {
        $this->scripts->handle(Egg::query()->findOrFail($egg), $request->normalize());

        return $this->script($egg);
    }

    /** @return array<string, mixed> */
    private function variables(Egg $egg): array
    {
        return [
            'id' => $egg->id,
            'name' => $egg->name,
            'nest' => ['id' => $egg->nest->id, 'name' => $egg->nest->name],
            'variables' => $egg->variables->sortBy('id')->map(fn (EggVariable $variable) => [
                'id' => $variable->id,
                'name' => $variable->name,
                'description' => (string) $variable->description,
                'env_variable' => $variable->env_variable,
                'default_value' => (string) $variable->default_value,
                'user_viewable' => (bool) $variable->user_viewable,
                'user_editable' => (bool) $variable->user_editable,
                'rules' => $variable->rules,
            ])->values()->all(),
        ];
    }
}
