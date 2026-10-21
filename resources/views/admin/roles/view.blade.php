@extends('layouts.admin')

@section('title')
    {{ $exists ? $role->name : 'New role' }}
@endsection

@section('content-header')
    <h1>{{ $exists ? $role->name : 'New role' }}<small>{{ $exists ? ($role->description ?: 'A role.') : 'Pick what the role may do.' }}</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li><a href="{{ route('admin.roles') }}">Roles</a></li>
        <li class="active">{{ $exists ? $role->name : 'New' }}</li>
    </ol>
@endsection

@section('content')
    @php
        $viewer = Auth::user();
        $canEdit = $exists ? ($viewer->hasPermission('roles.update') && $covers) : $viewer->hasPermission('roles.create');
    @endphp
    @if($exists && !$covers)
        <div class="alert alert-warning">This role holds permissions that you do not hold yourself, so you can look at it but not change it.</div>
    @endif
    <form action="{{ $exists ? route('admin.roles.view', $role->id) : route('admin.roles.new') }}" method="POST" id="role-form">
        <div class="row">
            <div class="col-md-8">
                @php
                    $everyone = ['label' => 'Everybody', 'description' => 'What every account can do without a role. A role can take it away (deny), or, where the panel has a switch for it, allow it for the people who have the role.', 'permissions' => $user];
                    $all = $groups + ['self' => $everyone];
                @endphp
                @foreach($all as $key => $group)
                    <div class="box">
                        <div class="box-header with-border">
                            <h3 class="box-title">{{ $group['label'] }}</h3>
                            @if($canEdit)
                                <div class="box-tools">
                                    <a href="#" class="small" data-all="{{ $key }}">grant all</a> &nbsp;/&nbsp; <a href="#" class="small" data-none="{{ $key }}">reset</a>
                                </div>
                            @endif
                        </div>
                        <div class="box-body" data-group="{{ $key }}">
                            <p class="text-muted small">{{ $group['description'] }}</p>
                            @foreach($group['permissions'] as $permission => $label)
                                @php
                                    $needs = \Pterodactyl\Services\Roles\PermissionRegistry::viewOf($permission);
                                    $isUser = $key === 'self';
                                    $cannotGrant = !$isUser && $mine !== null && !in_array($permission, $mine, true);
                                    $state = in_array($permission, old('denied', $denied), true) ? 'deny' : (in_array($permission, old('permissions', $held), true) ? 'grant' : 'default');
                                    if (old('states.' . $permission)) { $state = old('states.' . $permission); }
                                @endphp
                                <div class="perm-row" data-needs="{{ $needs }}" data-key="{{ $permission }}">
                                    <div class="perm-states" role="radiogroup">
                                        <label class="perm-state perm-default"><input type="radio" name="states[{{ $permission }}]" value="default" @if($state === 'default') checked @endif @if(!$canEdit) disabled @endif><span>Default</span></label>
                                        <label class="perm-state perm-grant"><input type="radio" name="states[{{ $permission }}]" value="grant" @if($state === 'grant') checked @endif @if(!$canEdit || $cannotGrant) disabled @endif><span>Grant</span></label>
                                        <label class="perm-state perm-deny"><input type="radio" name="states[{{ $permission }}]" value="deny" @if($state === 'deny') checked @endif @if(!$canEdit) disabled @endif><span>Deny</span></label>
                                    </div>
                                    <div class="perm-label">{{ $label }} <code class="small">{{ $permission }}</code>@if($cannotGrant) <span class="text-muted small">(you do not hold this)</span>@endif</div>
                                </div>
                            @endforeach
                        </div>
                    </div>
                @endforeach
            </div>
            <div class="col-md-4">
                <div class="box">
                    <div class="box-header with-border"><h3 class="box-title">Role</h3></div>
                    <div class="box-body">
                        <div class="form-group">
                            <label class="control-label" for="name">Name</label>
                            <input id="name" type="text" name="name" class="form-control" required maxlength="60" value="{{ old('name', $role->name) }}" @if(!$canEdit) disabled @endif>
                        </div>
                        <div class="form-group">
                            <label class="control-label" for="description">Description</label>
                            <input id="description" type="text" name="description" class="form-control" maxlength="255" value="{{ old('description', $role->description) }}" @if(!$canEdit) disabled @endif>
                        </div>
                        <div class="form-group no-margin-bottom">
                            <label class="control-label" for="color">Colour</label>
                            <input id="color" type="color" name="color" class="form-control" style="height: 34px; padding: 2px;" value="{{ old('color', $role->color) }}" @if(!$canEdit) disabled @endif>
                        </div>
                    </div>
                    @if($canEdit || ($exists && $viewer->hasPermission('roles.delete') && $covers))
                        <div class="box-footer">
                            {!! csrf_field() !!}
                            @if($exists && $viewer->hasPermission('roles.delete') && $covers)
                                <button type="submit" form="delete-role" class="btn btn-sm btn-danger" onclick="return confirm('Delete {{ e($role->name) }}? The people who have it lose what it gives them.')">Delete</button>
                            @endif
                            @if($canEdit)
                                @if($exists)
                                    <button type="submit" name="_method" value="PATCH" class="btn btn-sm btn-primary pull-right">Save</button>
                                @else
                                    <button type="submit" class="btn btn-sm btn-primary pull-right">Create</button>
                                @endif
                            @endif
                        </div>
                    @endif
                </div>
                <div class="box">
                    <div class="box-body">
                        <p class="text-muted small no-margin-bottom">
                            <strong>Default</strong> says nothing: in the admin area that means no access, for what everybody can do it means what the panel allows.
                            <strong>Grant</strong> gives it, and also the "see" permission of its group. <strong>Deny</strong> takes it away and wins over a grant
                            of another role. A role can only grant admin permissions that the person editing it holds. Root admins are not limited by roles.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </form>

    @if($exists)
        <form id="delete-role" action="{{ route('admin.roles.delete', $role->id) }}" method="POST">
            {!! csrf_field() !!}
            {!! method_field('DELETE') !!}
        </form>
        <div class="row">
            <div class="col-md-8">
                <div class="box">
                    <div class="box-header with-border">
                        <h3 class="box-title">People with this role <span class="label label-default">{{ $members->count() }}</span></h3>
                    </div>
                    <div class="box-body table-responsive no-padding">
                        <table class="table table-hover">
                            <tbody>
                                @forelse($members as $member)
                                    <tr>
                                        <td>
                                            @if($viewer->hasPermission('users.view'))
                                                <a href="{{ route('admin.users.view', $member->id) }}">{{ $member->username }}</a>
                                            @else
                                                {{ $member->username }}
                                            @endif
                                            @if($member->root_admin)<span class="label label-warning">Root admin</span>@endif
                                        </td>
                                        <td>{{ $member->email }}</td>
                                        <td class="text-muted small">since {{ optional($member->pivot->created_at)->diffForHumans() }}</td>
                                        <td class="text-right">
                                            @if($viewer->hasPermission('roles.assign') && $covers)
                                                <form action="{{ route('admin.roles.members.remove', [$role->id, $member->id]) }}" method="POST" style="display: inline;">
                                                    {!! csrf_field() !!}
                                                    {!! method_field('DELETE') !!}
                                                    <button type="submit" class="btn btn-xs btn-default">Remove</button>
                                                </form>
                                            @endif
                                        </td>
                                    </tr>
                                @empty
                                    <tr><td class="text-muted text-center">Nobody has this role yet.</td></tr>
                                @endforelse
                            </tbody>
                        </table>
                    </div>
                    @if($viewer->hasPermission('roles.assign') && $covers)
                        <div class="box-footer">
                            <form action="{{ route('admin.roles.members.add', $role->id) }}" method="POST" class="form-inline">
                                {!! csrf_field() !!}
                                <input type="text" name="user" class="form-control input-sm" placeholder="Username or email address" required style="min-width: 260px;">
                                <button type="submit" class="btn btn-sm btn-primary">Give this role</button>
                            </form>
                        </div>
                    @endif
                </div>
            </div>
        </div>
    @endif
@endsection

@section('footer-scripts')
    @parent
    <style>
        .perm-row { display: flex; align-items: center; gap: 14px; padding: 5px 0; }
        .perm-states { display: inline-flex; flex-shrink: 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
        .perm-state { margin: 0; cursor: pointer; font-weight: 500; }
        .perm-state input { position: absolute; opacity: 0; pointer-events: none; }
        .perm-state span { display: block; min-width: 62px; padding: 4px 10px; text-align: center; font-size: 12px; color: var(--muted); background: var(--card); border-right: 1px solid var(--border); }
        .perm-state:last-child span { border-right: 0; }
        .perm-state input:checked + span { color: var(--text); background: var(--soft-2); font-weight: 600; }
        .perm-grant input:checked + span { color: var(--green-text); background: var(--green-soft); }
        .perm-deny input:checked + span { color: var(--red-text); background: var(--red-soft); }
        .perm-state input:disabled + span { opacity: 0.55; cursor: not-allowed; }
        .perm-state input:focus-visible + span { box-shadow: inset 0 0 0 2px var(--primary); }
        .perm-label { min-width: 0; }
    </style>
    <script>
        (function () {
            var form = document.getElementById('role-form');
            function row(key) { return form.querySelector('.perm-row[data-key="' + key + '"]'); }
            function state(r) { var c = r.querySelector('input:checked'); return c ? c.value : 'default'; }
            function set(r, value) { var i = r.querySelector('input[value="' + value + '"]'); if (i && !i.disabled) { i.checked = true; } }
            form.addEventListener('change', function (event) {
                var input = event.target;
                if (input.type !== 'radio') { return; }
                var r = input.closest('.perm-row');
                // A permission needs the "see" permission of its group, and taking that away takes the others with it.
                if (input.value === 'grant' && r.dataset.needs) {
                    var needed = row(r.dataset.needs);
                    if (needed && state(needed) !== 'grant') { set(needed, 'grant'); }
                }
                if (input.value !== 'grant') {
                    form.querySelectorAll('.perm-row[data-needs="' + r.dataset.key + '"]').forEach(function (other) { if (state(other) === 'grant') { set(other, 'default'); } });
                }
            });
            function rows(group) { return form.querySelectorAll('[data-group="' + group + '"] .perm-row'); }
            document.querySelectorAll('[data-all]').forEach(function (link) {
                link.addEventListener('click', function (e) { e.preventDefault(); rows(link.dataset.all).forEach(function (r) { set(r, 'grant'); }); });
            });
            document.querySelectorAll('[data-none]').forEach(function (link) {
                link.addEventListener('click', function (e) { e.preventDefault(); rows(link.dataset.none).forEach(function (r) { set(r, 'default'); }); });
            });
        })();
    </script>
@endsection
