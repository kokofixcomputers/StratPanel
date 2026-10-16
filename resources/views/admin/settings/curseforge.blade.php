@extends('layouts.admin')
@include('partials/admin.settings.nav', ['activeTab' => 'curseforge'])

@section('title')
    CurseForge
@endsection

@section('content-header')
    <h1>CurseForge<small>Let people install mods, plugins and worlds from CurseForge.</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li class="active">Settings</li>
    </ol>
@endsection

@section('content')
    @yield('settings::nav')
    <div class="row">
        <div class="col-md-8">
            <form action="{{ route('admin.settings.curseforge') }}" method="POST" autocomplete="off">
                <div class="box">
                    <div class="box-header with-border">
                        <h3 class="box-title">API key</h3>
                    </div>
                    <div class="box-body">
                        <p class="text-muted">
                            CurseForge only answers applications that have a key. With one, the Content page of every server gets a
                            CurseForge tab next to Modrinth: mods, plugins, data packs, resource packs and worlds can be browsed
                            with their pages and screenshots and installed, and the mods in the file manager get their icons.
                            Get a key for free at <a href="https://console.curseforge.com/" target="_blank" rel="noopener noreferrer">console.curseforge.com</a>.
                        </p>
                        <div class="form-group">
                            <label class="control-label" for="api-key">Key</label>
                            <input id="api-key" type="password" name="api_key" class="form-control" autocomplete="new-password" spellcheck="false"
                                   placeholder="{{ $enabled ? ($fromEnvironment ? 'A key is set in the environment (CURSEFORGE_API_KEY)' : 'A key is saved, enter a new one to replace it') : 'Paste your API key' }}">
                            <p class="text-muted small" style="margin-top: 6px;">
                                It is stored encrypted and never sent to a browser: the panel asks CurseForge for people, so the key stays secret.
                                @if($enabled)
                                    <span class="label label-success">CurseForge is on</span>
                                @else
                                    <span class="label label-default">CurseForge is off</span>
                                @endif
                            </p>
                        </div>
                        @if($enabled && !$fromEnvironment)
                            <div class="checkbox checkbox-primary no-margin-bottom">
                                <input id="remove-key" type="checkbox" name="remove_key" value="1">
                                <label for="remove-key">Remove the saved key (turns CurseForge off)</label>
                            </div>
                        @endif
                    </div>
                    <div class="box-footer">
                        {!! csrf_field() !!}
                        @if($enabled)
                            <button type="submit" formaction="{{ route('admin.settings.curseforge.test') }}" formmethod="POST" formnovalidate class="btn btn-sm btn-default">Test the key</button>
                        @endif
                        <button type="submit" name="_method" value="PATCH" class="btn btn-sm btn-primary pull-right">Save</button>
                    </div>
                </div>
            </form>
        </div>
        <div class="col-md-4">
            <div class="box">
                <div class="box-header with-border">
                    <h3 class="box-title">Good to know</h3>
                </div>
                <div class="box-body">
                    <ul class="small" style="padding-left: 18px; margin: 0;">
                        <li>Some authors do not allow their files to be downloaded outside CurseForge. Those show a link to CurseForge instead of an install button.</li>
                        <li>Searches and project pages are kept for a few minutes, so a busy panel does not use up the limits of the key.</li>
                        <li>Modpacks are only installed from Modrinth.</li>
                    </ul>
                </div>
            </div>
        </div>
    </div>
@endsection
