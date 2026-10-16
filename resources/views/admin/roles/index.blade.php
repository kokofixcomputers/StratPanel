@extends('layouts.admin')

@section('title')
    Roles
@endsection

@section('content-header')
    <h1>Roles<small>Sets of permissions that can be given to people.</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li class="active">Roles</li>
    </ol>
@endsection

@section('content')
    <div class="row">
        <div class="col-xs-12">
            <div class="box box-primary">
                <div class="box-header with-border">
                    <h3 class="box-title">Role list</h3>
                    @if(Auth::user()->hasPermission('roles.create'))
                        <div class="box-tools">
                            <a href="{{ route('admin.roles.new') }}"><button class="btn btn-sm btn-primary">Create new</button></a>
                        </div>
                    @endif
                </div>
                <div class="box-body table-responsive no-padding">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Description</th>
                                <th class="text-center">Permissions</th>
                                <th class="text-center">People</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><span class="label label-warning"><i class="fa fa-star"></i> Root admin</span></td>
                                <td class="text-muted">Can do everything and can not be limited. Set on a user's page.</td>
                                <td class="text-center text-muted">all</td>
                                <td class="text-center">{{ \Pterodactyl\Models\User::query()->where('root_admin', true)->count() }}</td>
                            </tr>
                            @foreach($roles as $role)
                                <tr>
                                    <td><a href="{{ route('admin.roles.view', $role->id) }}"><span class="label" style="background-color: {{ $role->color }};">{{ $role->name }}</span></a></td>
                                    <td>{{ $role->description }}</td>
                                    <td class="text-center">{{ count($role->permissionList()) }}</td>
                                    <td class="text-center">{{ $role->users_count }}</td>
                                </tr>
                            @endforeach
                            @if($roles->isEmpty())
                                <tr><td colspan="4" class="text-muted text-center">No roles yet.</td></tr>
                            @endif
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
@endsection
