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
                @foreach($groups as $key => $group)
                    <div class="box">
                        <div class="box-header with-border">
                            <h3 class="box-title">{{ $group['label'] }}</h3>
                            @if($canEdit)
                                <div class="box-tools">
                                    <a href="#" class="small" data-all="{{ $key }}">select all</a> &nbsp;/&nbsp; <a href="#" class="small" data-none="{{ $key }}">none</a>
                                </div>
                            @endif
                        </div>
                        <div class="box-body" data-group="{{ $key }}">
                            <p class="text-muted small">{{ $group['description'] }}</p>
                            @foreach($group['permissions'] as $permission => $label)
                                @php
                                    $needs = \Pterodactyl\Services\Roles\PermissionRegistry::viewOf($permission);
                                    $cannotGrant = $mine !== null && !in_array($permission, $mine, true);
                                @endphp
                                <div class="checkbox checkbox-primary" style="margin: 4px 0;">
                                    <input type="checkbox" id="p-{{ $permission }}" name="permissions[]" value="{{ $permission }}"
                                           data-needs="{{ $needs }}"
                                           @if(in_array($permission, old('permissions', $held), true)) checked @endif
                                           @if(!$canEdit || $cannotGrant) disabled @endif>
                                    <label for="p-{{ $permission }}">{{ $label }} <code class="small">{{ $permission }}</code>@if($cannotGrant) <span class="text-muted small">(you do not hold this)</span>@endif</label>
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
                            Every permission also gives the "see" permission of its group. A role can only hold permissions that the person
                            editing it holds, and can only be changed by somebody who holds all of them. Root admins are not limited by roles.
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
    <script>
        (function () {
            var form = document.getElementById('role-form');
            function boxes(group) { return form.querySelectorAll('[data-group="' + group + '"] input[type=checkbox]:not(:disabled)'); }
            form.addEventListener('change', function (event) {
                var box = event.target;
                if (box.type !== 'checkbox') { return; }
                // A permission needs the "see" permission of its group, and taking that away takes the others with it.
                if (box.checked && box.dataset.needs) {
                    var needed = document.getElementById('p-' + box.dataset.needs);
                    if (needed && !needed.disabled) { needed.checked = true; }
                }
                if (!box.checked) {
                    form.querySelectorAll('input[data-needs="' + box.value + '"]').forEach(function (other) { if (!other.disabled) { other.checked = false; } });
                }
            });
            document.querySelectorAll('[data-all]').forEach(function (link) {
                link.addEventListener('click', function (e) { e.preventDefault(); boxes(link.dataset.all).forEach(function (b) { b.checked = true; }); });
            });
            document.querySelectorAll('[data-none]').forEach(function (link) {
                link.addEventListener('click', function (e) { e.preventDefault(); boxes(link.dataset.none).forEach(function (b) { b.checked = false; }); });
            });
        })();
    </script>
@endsection
