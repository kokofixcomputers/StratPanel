@extends('layouts.admin')

@section('title')
    Manage User: {{ $user->username }}
@endsection

@section('content-header')
    <h1>{{ $user->name_first }} {{ $user->name_last}}<small>{{ $user->username }}</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li><a href="{{ route('admin.users') }}">Users</a></li>
        <li class="active">{{ $user->username }}</li>
    </ol>
@endsection

@section('content')
<div class="row">
    <form action="{{ route('admin.users.view', $user->id) }}" method="post">
        <div class="col-md-6">
            <div class="box box-primary">
                <div class="box-header with-border">
                    <h3 class="box-title">Identity</h3>
                </div>
                <div class="box-body">
                    <div class="form-group">
                        <label for="email" class="control-label">Email</label>
                        <div>
                            <input type="email" name="email" value="{{ $user->email }}" class="form-control form-autocomplete-stop">
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="registered" class="control-label">Username</label>
                        <div>
                            <input type="text" name="username" value="{{ $user->username }}" class="form-control form-autocomplete-stop">
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="registered" class="control-label">Client First Name</label>
                        <div>
                            <input type="text" name="name_first" value="{{ $user->name_first }}" class="form-control form-autocomplete-stop">
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="registered" class="control-label">Client Last Name</label>
                        <div>
                            <input type="text" name="name_last" value="{{ $user->name_last }}" class="form-control form-autocomplete-stop">
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="control-label">Default Language</label>
                        <div>
                            <select name="language" class="form-control">
                                @foreach($languages as $key => $value)
                                    <option value="{{ $key }}" @if($user->language === $key) selected @endif>{{ $value }}</option>
                                @endforeach
                            </select>
                            <p class="text-muted"><small>The default language to use when rendering the Panel for this user.</small></p>
                        </div>
                    </div>
                </div>
                <div class="box-footer">
                    {!! csrf_field() !!}
                    {!! method_field('PATCH') !!}
                    <input type="submit" value="Update User" class="btn btn-primary btn-sm">
                </div>
            </div>
        </div>
        <div class="col-md-6">
            <div class="box">
                <div class="box-header with-border">
                    <h3 class="box-title">Password</h3>
                </div>
                <div class="box-body">
                    <div class="alert alert-success" style="display:none;margin-bottom:10px;" id="gen_pass"></div>
                    <div class="form-group no-margin-bottom">
                        <label for="password" class="control-label">Password <span class="field-optional"></span></label>
                        <div>
                            <input type="password" id="password" name="password" class="form-control form-autocomplete-stop">
                            <p class="text-muted small">Leave blank to keep this user's password the same. User will not receive any notification if password is changed.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-md-6">
            <div class="box">
                <div class="box-header with-border">
                    <h3 class="box-title">Permissions</h3>
                </div>
                <div class="box-body">
                    @if(Auth::user()->root_admin)
                        <div class="form-group">
                            <label for="root_admin" class="control-label">Root admin</label>
                            <div>
                                <select name="root_admin" class="form-control">
                                    <option value="0">@lang('strings.no')</option>
                                    <option value="1" {{ $user->root_admin ? 'selected="selected"' : '' }}>@lang('strings.yes')</option>
                                </select>
                                <p class="text-muted"><small>A root admin can do everything and can not be limited by roles. Give this to very few people, others get roles.</small></p>
                            </div>
                        </div>
                    @else
                        <p class="no-margin">@if($user->root_admin)<span class="label label-warning"><i class="fa fa-star"></i> Root admin</span> @else Not a root admin. @endif <span class="text-muted small">Only root admins make root admins.</span></p>
                    @endif
                </div>
            </div>
        </div>
    </form>
    @if(!$canChange)
        <div class="col-xs-12"><div class="alert alert-warning">This account is a root admin or holds permissions that you do not hold, so you can look at it but not change it.</div></div>
    @endif
    @if(Auth::user()->hasPermission('users.update'))
        @php($pools = app(\Pterodactyl\Services\Pools\ResourcePool::class))
        @php($poolLimits = $pools->limits($user))
        @php($poolUsed = $pools->used($user))
        <div class="col-xs-12">
            <div class="box">
                <div class="box-header with-border">
                    <h3 class="box-title">Resource pool</h3>
                    @if(!$pools->enabled())
                        <span class="label label-default" style="margin-left: 6px;">Resource pools are off</span>
                    @elseif($user->hasPermission('servers.create'))
                        <span class="label label-warning" style="margin-left: 6px;">Not limited: can create servers in the admin area</span>
                    @endif
                </div>
                <form action="{{ route('admin.settings.pools.user', $user->id) }}" method="POST">
                    <div class="box-body">
                        <p class="text-muted">What this person may spend on the servers they create themselves. Leave a field empty to give them the default of the panel (shown as the placeholder).
                            @if(Auth::user()->hasPermission('settings.pools.view'))<a href="{{ route('admin.settings.pools') }}">Defaults and the switch</a>.@endif</p>
                        <div class="row">
                            @foreach(['memory' => ['Memory (MB)', 'pool_memory'], 'disk' => ['Disk space (MB)', 'pool_disk'], 'cpu' => ['CPU (%)', 'pool_cpu'], 'allocations' => ['Allocations', 'pool_allocations']] as $resource => [$label, $column])
                                <div class="form-group col-sm-3">
                                    <label class="control-label" for="pool-{{ $resource }}">{{ $label }}</label>
                                    <input id="pool-{{ $resource }}" type="number" min="0" name="{{ $resource }}" class="form-control" placeholder="{{ $pools->defaults()[$resource] }}" value="{{ old($resource, $user->getAttribute($column)) }}" @if(!$canChange) disabled @endif>
                                    <p class="text-muted small no-margin-bottom">uses {{ \Pterodactyl\Services\Pools\ResourcePool::format($resource, $poolUsed[$resource]) }} of {{ \Pterodactyl\Services\Pools\ResourcePool::format($resource, $poolLimits[$resource]) }}</p>
                                </div>
                            @endforeach
                        </div>
                    </div>
                    @if($canChange)
                        <div class="box-footer">
                            {!! csrf_field() !!}
                            {!! method_field('PATCH') !!}
                            <button type="submit" class="btn btn-sm btn-primary pull-right">Save pool</button>
                        </div>
                    @endif
                </form>
            </div>
        </div>
    @endif
    @if(Auth::user()->hasAnyPermission('roles.view', 'roles.assign'))
        <div class="col-xs-12">
            <div class="box">
                <div class="box-header with-border">
                    <h3 class="box-title">Roles</h3>
                </div>
                <form action="{{ route('admin.roles.user', $user->id) }}" method="POST">
                    <div class="box-body">
                        @if($user->root_admin)
                            <p class="text-muted">Root admins can do everything, whatever roles they have.</p>
                        @endif
                        @forelse($roles as $role)
                            @php($assignable = Auth::user()->hasPermission('roles.assign') && $canChange && $roleService->covers(Auth::user(), $role))
                            <div class="checkbox checkbox-primary" style="margin: 4px 0;">
                                <input type="checkbox" id="role-{{ $role->id }}" name="roles[]" value="{{ $role->id }}" @if(in_array($role->id, $userRoleIds)) checked @endif @if(!$assignable) disabled @endif>
                                <label for="role-{{ $role->id }}"><span class="label" style="background-color: {{ $role->color }};">{{ $role->name }}</span> <span class="text-muted small">{{ $role->description }}</span></label>
                            </div>
                        @empty
                            <p class="text-muted no-margin">There are no roles yet.</p>
                        @endforelse
                    </div>
                    @if(Auth::user()->hasPermission('roles.assign') && $canChange && !$roles->isEmpty())
                        <div class="box-footer">
                            {!! csrf_field() !!}
                            <button type="submit" class="btn btn-sm btn-primary pull-right">Save roles</button>
                        </div>
                    @endif
                </form>
            </div>
        </div>
    @endif
    <div class="col-xs-12">
        <div class="box box-danger">
            <div class="box-header with-border">
                <h3 class="box-title">Delete User</h3>
            </div>
            <div class="box-body">
                <p class="no-margin">There must be no servers associated with this account in order for it to be deleted.</p>
            </div>
            <div class="box-footer">
                <form action="{{ route('admin.users.view', $user->id) }}" method="POST">
                    {!! csrf_field() !!}
                    {!! method_field('DELETE') !!}
                    <input id="delete" type="submit" class="btn btn-sm btn-danger pull-right" {{ $user->servers->count() < 1 ?: 'disabled' }} value="Delete User" />
                </form>
            </div>
        </div>
    </div>
</div>
@endsection
